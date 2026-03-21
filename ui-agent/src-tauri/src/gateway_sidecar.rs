use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const DEFAULT_GATEWAY_PORT: u16 = 18_789;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct GatewayStatusSnapshot {
    pub state: String,
    pub port: u16,
    pub healthy: bool,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

struct GatewaySidecarRuntime {
    child: Option<Child>,
    port: u16,
    healthy: bool,
    last_error: Option<String>,
}

impl Default for GatewaySidecarRuntime {
    fn default() -> Self {
        Self {
            child: None,
            port: DEFAULT_GATEWAY_PORT,
            healthy: false,
            last_error: None,
        }
    }
}

#[derive(Default)]
pub struct GatewaySidecarState {
    runtime: Mutex<GatewaySidecarRuntime>,
}

struct GatewayLaunchPlan {
    executable: PathBuf,
    cwd: PathBuf,
    args: Vec<String>,
    env: Vec<(String, String)>,
}

struct PackagedRuntimeLayout {
    node_path: PathBuf,
    openclaw_dir: PathBuf,
    entry_path: PathBuf,
    ui_agent_root: Option<PathBuf>,
}

fn normalize_windows_child_path_string(raw: &str) -> String {
    if let Some(stripped) = raw.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{stripped}");
    }
    if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        return stripped.to_string();
    }
    raw.to_string()
}

fn normalize_windows_child_path(path: &Path) -> PathBuf {
    PathBuf::from(normalize_windows_child_path_string(&path.to_string_lossy()))
}

fn resolve_node_entry_arg(cwd: &Path, entry_path: &Path) -> String {
    if let Ok(relative) = entry_path.strip_prefix(cwd) {
        let candidate = relative.to_string_lossy();
        if !candidate.is_empty() {
            return normalize_windows_child_path_string(&candidate);
        }
    }

    normalize_windows_child_path_string(&entry_path.to_string_lossy())
}

fn gateway_run_args(cwd: &Path, entry_path: &Path, port: u16) -> Vec<String> {
    vec![
        resolve_node_entry_arg(cwd, entry_path),
        "gateway".into(),
        "run".into(),
        "--bind".into(),
        "loopback".into(),
        "--port".into(),
        port.to_string(),
        "--force".into(),
        "--allow-unconfigured".into(),
    ]
}

fn resolve_ui_agent_root_from_resource_dir(resource_dir: &Path) -> Option<PathBuf> {
    let root = resource_dir.join("runtime").join("ui-agent");
    root.join("index.html").is_file().then_some(root)
}

fn resolve_packaged_runtime_dir(resource_dir: &Path) -> PathBuf {
    resource_dir.join("runtime")
}

fn resolve_packaged_node_path(runtime_dir: &Path) -> Option<PathBuf> {
    let nested = runtime_dir
        .join("node")
        .join(if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        });
    if nested.is_file() {
        return Some(nested);
    }

    let flattened = runtime_dir.join(if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    });
    if flattened.is_file() {
        return Some(flattened);
    }

    let flat_windows_node = runtime_dir.join("node");
    flat_windows_node.is_file().then_some(flat_windows_node)
}

fn resolve_packaged_openclaw_layout(runtime_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    let nested_dir = runtime_dir.join("openclaw");
    let nested_entry = nested_dir.join("openclaw.mjs");
    let nested_dist = nested_dir.join("dist");
    let nested_node_modules = nested_dir.join("node_modules");
    if nested_entry.is_file() && nested_dist.is_dir() && nested_node_modules.is_dir() {
        return Some((nested_dir, nested_entry));
    }

    let flattened_entry = runtime_dir.join("openclaw.mjs");
    let flattened_dist = runtime_dir.join("dist");
    let flattened_node_modules = runtime_dir.join("node_modules");
    if flattened_entry.is_file() && flattened_dist.is_dir() && flattened_node_modules.is_dir() {
        return Some((runtime_dir.to_path_buf(), flattened_entry));
    }

    None
}

fn resolve_packaged_ui_agent_root(runtime_dir: &Path) -> Option<PathBuf> {
    let nested = runtime_dir.join("ui-agent");
    if nested.join("index.html").is_file() {
        return Some(nested);
    }

    runtime_dir
        .join("index.html")
        .is_file()
        .then_some(runtime_dir.to_path_buf())
}

fn resolve_packaged_runtime_layout(
    resource_dir: &Path,
) -> Result<Option<PackagedRuntimeLayout>, String> {
    let runtime_dir = resolve_packaged_runtime_dir(resource_dir);
    if !runtime_dir.exists() {
        return Ok(None);
    }

    let node_path = resolve_packaged_node_path(&runtime_dir);
    let openclaw_layout = resolve_packaged_openclaw_layout(&runtime_dir);
    let ui_agent_root = resolve_packaged_ui_agent_root(&runtime_dir)
        .or_else(|| resolve_ui_agent_root_from_resource_dir(resource_dir));

    if let (Some(node_path), Some((openclaw_dir, entry_path)), Some(ui_agent_root)) =
        (node_path, openclaw_layout, ui_agent_root)
    {
        return Ok(Some(PackagedRuntimeLayout {
            node_path,
            openclaw_dir,
            entry_path,
            ui_agent_root: Some(ui_agent_root),
        }));
    }

    if runtime_dir.join("node").exists()
        || runtime_dir.join("node.exe").exists()
        || runtime_dir.join("openclaw").exists()
        || runtime_dir.join("openclaw.mjs").exists()
        || runtime_dir.join("dist").exists()
        || runtime_dir.join("ui-agent").exists()
        || runtime_dir.join("index.html").exists()
    {
        return Err(format!(
            "packaged runtime layout is invalid under {}: expected runtime/openclaw/openclaw.mjs, runtime/openclaw/dist/*, runtime/openclaw/node_modules/*, runtime/ui-agent/*, and runtime/node/*",
            runtime_dir.display()
        ));
    }

    Ok(None)
}

pub fn validate_packaged_runtime_layout(resource_dir: &Path) -> Result<(), String> {
    resolve_packaged_runtime_layout(resource_dir).map(|_| ())
}

fn resolve_dev_ui_agent_root() -> Option<PathBuf> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../out")
        .canonicalize()
        .ok()?;
    root.exists().then_some(root)
}

fn resolve_desktop_config_seed_path() -> Option<PathBuf> {
    let explicit = env::var("OPENCLAW_CONFIG_PATH")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    if explicit.is_some() {
        return explicit;
    }

    let state_dir = env::var("OPENCLAW_STATE_DIR")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            env::var("HOME")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .map(|home| PathBuf::from(home).join(".openclaw"))
        });

    state_dir.map(|dir| dir.join("openclaw.json"))
}

fn load_json5_config(path: &Path) -> Result<Value, String> {
    let raw = fs::read_to_string(path).map_err(|error| {
        format!(
            "failed to read desktop config seed {}: {error}",
            path.display()
        )
    })?;
    json5::from_str::<Value>(&raw).map_err(|error| {
        format!(
            "failed to parse desktop config seed {}: {error}",
            path.display()
        )
    })
}

fn ensure_object(value: &mut Value) -> &mut serde_json::Map<String, Value> {
    if !value.is_object() {
        *value = json!({});
    }

    value
        .as_object_mut()
        .expect("value should be converted to object")
}

fn build_desktop_gateway_config(
    seed_path: Option<&Path>,
    control_ui_root: Option<&Path>,
) -> Result<Value, String> {
    let mut config = if let Some(seed_path) = seed_path.filter(|path| path.exists()) {
        load_json5_config(&seed_path)?
    } else {
        json!({})
    };

    let gateway = ensure_object(
        ensure_object(&mut config)
            .entry("gateway")
            .or_insert_with(|| json!({})),
    );
    gateway.insert("mode".into(), Value::String("local".into()));
    gateway.insert("auth".into(), json!({ "mode": "none" }));

    let control_ui = ensure_object(gateway.entry("controlUi").or_insert_with(|| json!({})));
    control_ui.insert("enabled".into(), Value::Bool(true));
    if let Some(root) = control_ui_root {
        control_ui.insert(
            "root".into(),
            Value::String(normalize_windows_child_path_string(&root.to_string_lossy())),
        );
    }

    Ok(config)
}

fn write_desktop_gateway_config(
    app_handle: &AppHandle,
    control_ui_root: Option<&Path>,
) -> Result<PathBuf, String> {
    let app_config_dir = app_handle
        .path()
        .app_config_dir()
        .or_else(|_| app_handle.path().app_data_dir())
        .map_err(|error| format!("failed to resolve desktop config dir: {error}"))?;
    let gateway_dir = app_config_dir.join("gateway");
    fs::create_dir_all(&gateway_dir).map_err(|error| {
        format!(
            "failed to create desktop config dir {}: {error}",
            gateway_dir.display()
        )
    })?;

    let config_path = gateway_dir.join("openclaw.desktop.json");
    let seed_path = if config_path.exists() {
        Some(config_path.clone())
    } else {
        resolve_desktop_config_seed_path()
    };
    let config = build_desktop_gateway_config(seed_path.as_deref(), control_ui_root)?;
    let rendered = serde_json::to_vec_pretty(&config)
        .map_err(|error| format!("failed to encode desktop gateway config: {error}"))?;
    fs::write(&config_path, rendered).map_err(|error| {
        format!(
            "failed to write desktop gateway config {}: {error}",
            config_path.display()
        )
    })?;

    Ok(config_path)
}

fn resolve_packaged_launch_plan(
    app_handle: &AppHandle,
    port: u16,
) -> Result<Option<GatewayLaunchPlan>, String> {
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|error| format!("failed to resolve resource directory: {error}"))?;
    let Some(layout) = resolve_packaged_runtime_layout(&resource_dir)? else {
        return Ok(None);
    };

    let config_path = write_desktop_gateway_config(app_handle, layout.ui_agent_root.as_deref())?;

    Ok(Some(GatewayLaunchPlan {
        executable: normalize_windows_child_path(&layout.node_path),
        cwd: normalize_windows_child_path(&layout.openclaw_dir),
        args: gateway_run_args(&layout.openclaw_dir, &layout.entry_path, port),
        env: vec![(
            "OPENCLAW_CONFIG_PATH".into(),
            normalize_windows_child_path_string(&config_path.to_string_lossy()),
        )],
    }))
}

fn resolve_dev_launch_plan(app_handle: &AppHandle, port: u16) -> Result<GatewayLaunchPlan, String> {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .map_err(|error| format!("failed to resolve repo root: {error}"))?;
    let openclaw_entry = repo_root.join("openclaw.mjs");
    let ui_agent_root = resolve_dev_ui_agent_root();
    let config_path = write_desktop_gateway_config(app_handle, ui_agent_root.as_deref())?;

    Ok(GatewayLaunchPlan {
        executable: PathBuf::from("node"),
        args: gateway_run_args(&repo_root, &openclaw_entry, port),
        cwd: repo_root,
        env: vec![(
            "OPENCLAW_CONFIG_PATH".into(),
            normalize_windows_child_path_string(&config_path.to_string_lossy()),
        )],
    })
}

fn resolve_launch_plan(app_handle: &AppHandle, port: u16) -> Result<GatewayLaunchPlan, String> {
    if let Some(plan) = resolve_packaged_launch_plan(app_handle, port)? {
        return Ok(plan);
    }

    resolve_dev_launch_plan(app_handle, port)
}

fn read_child_stderr(child: &mut Child) -> String {
    let Some(mut stderr) = child.stderr.take() else {
        return String::new();
    };

    let mut buffer = Vec::new();
    if stderr.read_to_end(&mut buffer).is_err() {
        return String::new();
    }

    String::from_utf8_lossy(&buffer).into_owned()
}

fn format_gateway_exit_error(status: String, stderr: &str) -> String {
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        return format!("gateway exited with status {status}");
    }

    format!("gateway exited with status {status}\n\n{trimmed}")
}

impl GatewaySidecarState {
    pub fn is_healthy(&self) -> bool {
        self.runtime.lock().expect("gateway state poisoned").healthy
    }

    pub fn port(&self) -> u16 {
        self.runtime.lock().expect("gateway state poisoned").port
    }

    pub fn mark_health(&self, healthy: bool, error: Option<String>) {
        let mut runtime = self.runtime.lock().expect("gateway state poisoned");
        runtime.healthy = healthy;
        runtime.last_error = error;
    }

    pub fn start(&self, app_handle: &AppHandle) -> Result<(), String> {
        let mut runtime = self.runtime.lock().expect("gateway state poisoned");

        if let Some(child) = runtime.child.as_mut() {
            if child
                .try_wait()
                .map_err(|error| format!("failed to inspect gateway process: {error}"))?
                .is_none()
            {
                runtime.last_error = None;
                return Ok(());
            }

            runtime.child = None;
        }

        let launch_plan = resolve_launch_plan(app_handle, runtime.port)?;

        let child = Command::new(&launch_plan.executable)
            .args(&launch_plan.args)
            .envs(launch_plan.env.iter().map(|(key, value)| (key, value)))
            .current_dir(&launch_plan.cwd)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("failed to spawn gateway sidecar: {error}"))?;

        runtime.child = Some(child);
        runtime.healthy = false;
        runtime.last_error = None;
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut runtime = self.runtime.lock().expect("gateway state poisoned");
        if let Some(child) = runtime.child.as_mut() {
            child
                .kill()
                .map_err(|error| format!("failed to stop gateway sidecar: {error}"))?;
            let _ = child.wait();
        }

        runtime.child = None;
        runtime.healthy = false;
        runtime.last_error = None;
        Ok(())
    }

    pub fn snapshot(&self) -> Result<GatewayStatusSnapshot, String> {
        let mut runtime = self.runtime.lock().expect("gateway state poisoned");

        let mut state = "stopped".to_string();
        let mut pid = None;
        let healthy = runtime.healthy;
        if let Some(mut child) = runtime.child.take() {
            match child
                .try_wait()
                .map_err(|error| format!("failed to inspect gateway sidecar: {error}"))?
            {
                Some(status) => {
                    state = "error".to_string();
                    runtime.healthy = false;
                    let stderr = read_child_stderr(&mut child);
                    runtime.last_error =
                        Some(format_gateway_exit_error(status.to_string(), &stderr));
                }
                None => {
                    state = if healthy {
                        "running".to_string()
                    } else {
                        "starting".to_string()
                    };
                    pid = Some(child.id());
                    runtime.child = Some(child);
                }
            }
        }

        Ok(GatewayStatusSnapshot {
            state,
            port: runtime.port,
            healthy: runtime.healthy,
            pid,
            error: runtime.last_error.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{
        format_gateway_exit_error, gateway_run_args, normalize_windows_child_path_string,
        read_child_stderr, resolve_node_entry_arg,
    };
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};

    #[test]
    fn format_gateway_exit_error_includes_stderr() {
        let message = format_gateway_exit_error("exit code: 1".into(), "boom\n");
        assert_eq!(message, "gateway exited with status exit code: 1\n\nboom");
    }

    #[test]
    fn normalize_windows_child_path_string_strips_verbatim_prefix() {
        assert_eq!(
            normalize_windows_child_path_string(r"\\?\C:\Users\Peter\openclaw.mjs"),
            r"C:\Users\Peter\openclaw.mjs",
        );
        assert_eq!(
            normalize_windows_child_path_string(r"\\?\UNC\Server\Share\openclaw.mjs"),
            r"\\Server\Share\openclaw.mjs",
        );
    }

    #[test]
    fn gateway_run_args_strip_windows_verbatim_entry_prefix() {
        let cwd = Path::new(r"C:\Users\Peter\repo");
        let args = gateway_run_args(cwd, Path::new(r"\\?\C:\Users\Peter\openclaw.mjs"), 18_789);
        assert_eq!(args[0], r"C:\Users\Peter\openclaw.mjs");
    }

    #[test]
    fn resolve_node_entry_arg_prefers_relative_script_inside_cwd() {
        let cwd = PathBuf::from("/repo/openclaw");
        let entry_path = cwd.join("openclaw.mjs");

        assert_eq!(resolve_node_entry_arg(&cwd, &entry_path), "openclaw.mjs");
    }

    #[test]
    fn read_child_stderr_captures_output_after_exit() {
        let mut child = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .args(["/C", "(echo boom 1>&2) & exit /b 1"])
                .stderr(Stdio::piped())
                .spawn()
                .expect("spawn cmd test child")
        } else {
            Command::new("sh")
                .args(["-c", "printf 'boom\\n' >&2; exit 1"])
                .stderr(Stdio::piped())
                .spawn()
                .expect("spawn sh test child")
        };

        let status = child.wait().expect("wait for test child");
        assert!(!status.success());

        let stderr = read_child_stderr(&mut child);
        assert_eq!(stderr.trim(), "boom");
    }
}
