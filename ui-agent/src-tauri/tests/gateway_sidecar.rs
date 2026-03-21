use violet_lib::gateway_sidecar::GatewaySidecarState;

#[test]
fn reports_unhealthy_before_spawn() {
    let state = GatewaySidecarState::default();
    assert!(!state.is_healthy());
}

#[test]
fn packaged_runtime_layout_requires_nested_runtime_directories() {
    let root = std::env::temp_dir().join(format!(
        "hovi-gateway-sidecar-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos()
    ));
    let runtime_dir = root.join("runtime");
    std::fs::create_dir_all(&runtime_dir).expect("create runtime dir");
    std::fs::write(runtime_dir.join("node.exe"), b"test").expect("write flattened node");
    std::fs::write(runtime_dir.join("openclaw.mjs"), b"test").expect("write flattened entry");

    let error = violet_lib::gateway_sidecar::validate_packaged_runtime_layout(&root)
        .expect_err("flattened runtime layout should be rejected");

    assert!(error.contains("packaged runtime layout is invalid"));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn packaged_runtime_layout_accepts_flattened_legacy_runtime_directories() {
    let root = std::env::temp_dir().join(format!(
        "hovi-gateway-sidecar-legacy-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos()
    ));
    let runtime_dir = root.join("runtime");
    let dist_dir = runtime_dir.join("dist");
    let node_modules_dir = runtime_dir.join("node_modules");
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    std::fs::create_dir_all(&dist_dir).expect("create dist dir");
    std::fs::create_dir_all(&node_modules_dir).expect("create node_modules dir");
    std::fs::write(runtime_dir.join(node_name), b"test").expect("write flattened node");
    std::fs::write(runtime_dir.join("openclaw.mjs"), b"test").expect("write flattened entry");
    std::fs::write(runtime_dir.join("index.html"), b"test").expect("write flattened ui index");
    std::fs::write(dist_dir.join("entry.js"), b"test").expect("write flattened dist entry");

    violet_lib::gateway_sidecar::validate_packaged_runtime_layout(&root)
        .expect("flattened legacy runtime layout should be accepted");

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn packaged_runtime_layout_accepts_mixed_runtime_directories_with_flat_node() {
    let root = std::env::temp_dir().join(format!(
        "hovi-gateway-sidecar-mixed-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos()
    ));
    let runtime_dir = root.join("runtime");
    let openclaw_dir = runtime_dir.join("openclaw");
    let openclaw_dist_dir = openclaw_dir.join("dist");
    let openclaw_node_modules_dir = openclaw_dir.join("node_modules");
    let ui_agent_dir = runtime_dir.join("ui-agent");
    let node_name = if cfg!(target_os = "windows") {
        "node"
    } else {
        "node"
    };

    std::fs::create_dir_all(&openclaw_dist_dir).expect("create openclaw dist dir");
    std::fs::create_dir_all(&openclaw_node_modules_dir).expect("create openclaw node_modules dir");
    std::fs::create_dir_all(&ui_agent_dir).expect("create ui-agent dir");
    std::fs::write(runtime_dir.join(node_name), b"test").expect("write flat node binary");
    std::fs::write(openclaw_dir.join("openclaw.mjs"), b"test")
        .expect("write nested openclaw entry");
    std::fs::write(openclaw_dist_dir.join("entry.js"), b"test").expect("write nested dist entry");
    std::fs::write(ui_agent_dir.join("index.html"), b"test").expect("write nested ui index");

    violet_lib::gateway_sidecar::validate_packaged_runtime_layout(&root)
        .expect("mixed runtime layout with flat node should be accepted");

    let _ = std::fs::remove_dir_all(&root);
}
