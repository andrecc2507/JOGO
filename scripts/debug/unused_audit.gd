class_name UnusedAudit
extends Node

const SCENE_ROOTS := ["res://scene", "res://_deprecated"]
const SCRIPT_ROOT := "res://scripts"
const PROJECT_PATH := "res://project.godot"

func run_audit() -> void:
	print("=== UNUSED AUDIT (F10) ===")
	var scene_paths := _collect_scene_paths()
	var scene_node_map := _collect_scene_node_paths(scene_paths)
	var used_scripts := _collect_used_scripts(scene_node_map)
	used_scripts.append_array(_collect_autoload_scripts())
	var all_scripts := _collect_script_paths(SCRIPT_ROOT)
	var unused_scripts: Array = []
	for script_path in all_scripts:
		if not used_scripts.has(script_path):
			unused_scripts.append(script_path)
	var missing_nodes := _find_missing_node_references(all_scripts, scene_node_map)
	var duplicate_roots := _find_duplicate_scene_roots(scene_paths)
	print("Scenes scanned: %d" % scene_paths.size())
	print("Scripts scanned: %d" % all_scripts.size())
	print("Unused scripts (not in scenes/autoload): %d" % unused_scripts.size())
	for entry in unused_scripts:
		print("  - %s" % entry)
	print("Missing node paths referenced in scripts: %d" % missing_nodes.size())
	for entry in missing_nodes:
		print("  - %s" % entry)
	print("Duplicate scene root names: %d" % duplicate_roots.size())
	for entry in duplicate_roots:
		print("  - %s" % entry)
	print("=== END UNUSED AUDIT ===")
	_write_report(scene_paths, all_scripts, unused_scripts, missing_nodes, duplicate_roots)

func _write_report(scene_paths: Array, all_scripts: Array, unused_scripts: Array, missing_nodes: Array, duplicate_roots: Array) -> void:
	var lines: Array[String] = []
	lines.append("=== UNUSED AUDIT REPORT ===")
	lines.append("Scenes scanned: %d" % scene_paths.size())
	lines.append("Scripts scanned: %d" % all_scripts.size())
	lines.append("")
	lines.append("Unused scripts:")
	for entry in unused_scripts:
		lines.append("- %s" % entry)
	lines.append("")
	lines.append("Missing node paths referenced in scripts:")
	for entry in missing_nodes:
		lines.append("- %s" % entry)
	lines.append("")
	lines.append("Duplicate scene root names:")
	for entry in duplicate_roots:
		lines.append("- %s" % entry)
	lines.append("=== END REPORT ===")
	var report_dir := "res://_deprecated"
	if not DirAccess.dir_exists_absolute(report_dir):
		DirAccess.make_dir_recursive_absolute(report_dir)
	var file := FileAccess.open(report_dir.path_join("unused_report.txt"), FileAccess.WRITE)
	if file == null:
		push_warning("UnusedAudit: não foi possível escrever relatório.")
		return
	file.store_string("\n".join(lines))

func _collect_scene_paths() -> Array:
	var paths: Array = []
	for root in SCENE_ROOTS:
		if root.ends_with(".tscn"):
			if FileAccess.file_exists(root):
				paths.append(root)
			continue
		paths.append_array(_collect_scene_paths_in_dir(root))
	return paths

func _collect_scene_paths_in_dir(root: String) -> Array:
	var out: Array = []
	if not DirAccess.dir_exists_absolute(root):
		return out
	var dir := DirAccess.open(root)
	if dir == null:
		return out
	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		var full_path := root.path_join(file_name)
		if dir.current_is_dir():
			if file_name != "." and file_name != "..":
				out.append_array(_collect_scene_paths_in_dir(full_path))
		elif file_name.ends_with(".tscn"):
			out.append(full_path)
		file_name = dir.get_next()
	dir.list_dir_end()
	return out

func _collect_scene_node_paths(scene_paths: Array) -> Dictionary:
	var map := {}
	for scene_path in scene_paths:
		var packed := ResourceLoader.load(scene_path)
		if packed == null or not (packed is PackedScene):
			continue
		var root := (packed as PackedScene).instantiate()
		if root == null:
			continue
		var paths: Array = []
		var scripts: Array = []
		for node in _walk_nodes(root):
			var relative := root.get_path_to(node)
			paths.append(String(relative))
			var node_script: Script = node.get_script() as Script
			if node_script != null:
				var script_path := String(node_script.resource_path)
				if script_path != "" and not scripts.has(script_path):
					scripts.append(script_path)
		map[scene_path] = {"paths": paths, "root_name": root.name, "scripts": scripts}
		root.queue_free()
	return map

func _walk_nodes(root: Node) -> Array:
	var nodes: Array = [root]
	var index := 0
	while index < nodes.size():
		var node: Node = nodes[index]
		for child in node.get_children():
			nodes.append(child)
		index += 1
	return nodes

func _collect_used_scripts(scene_node_map: Dictionary) -> Array:
	var used: Array = []
	for entry in scene_node_map.values():
		for script_path in entry.get("scripts", []):
			if script_path != "" and not used.has(script_path):
				used.append(script_path)
	return used

func _collect_autoload_scripts() -> Array:
	var used: Array = []
	if not FileAccess.file_exists(PROJECT_PATH):
		return used
	var file := FileAccess.open(PROJECT_PATH, FileAccess.READ)
	if file == null:
		return used
	var in_autoload := false
	while not file.eof_reached():
		var line := file.get_line()
		if line.begins_with("["):
			in_autoload = line.strip_edges() == "[autoload]"
			continue
		if in_autoload and line.find("=") != -1:
			var parts := line.split("=")
			if parts.size() >= 2:
				var path := parts[1].strip_edges()
				path = path.trim_prefix("*")
				path = path.trim_prefix("\"")
				path = path.trim_suffix("\"")
				if path != "" and not used.has(path):
					used.append(path)
	return used

func _collect_script_paths(root: String) -> Array:
	var out: Array = []
	if not DirAccess.dir_exists_absolute(root):
		return out
	var dir := DirAccess.open(root)
	if dir == null:
		return out
	dir.list_dir_begin()
	var file_name := dir.get_next()
	while file_name != "":
		var full_path := root.path_join(file_name)
		if dir.current_is_dir():
			if file_name != "." and file_name != "..":
				out.append_array(_collect_script_paths(full_path))
		elif file_name.ends_with(".gd"):
			out.append(full_path)
		file_name = dir.get_next()
	dir.list_dir_end()
	return out

func _find_missing_node_references(script_paths: Array, scene_node_map: Dictionary) -> Array:
	var referenced: Array = []
	var regexes := [
		RegEx.new(),
		RegEx.new(),
		RegEx.new()
	]
	regexes[0].compile("get_node\\(\\\"([^\\\"]+)\\\"\\)")
	regexes[1].compile("get_node_or_null\\(\\\"([^\\\"]+)\\\"\\)")
	regexes[2].compile("\\$\\\"([^\\\"]+)\\\"")
	for script_path in script_paths:
		var file := FileAccess.open(script_path, FileAccess.READ)
		if file == null:
			continue
		var text := file.get_as_text()
		for regex in regexes:
			for result in regex.search_all(text):
				var path := String(result.get_string(1))
				if path != "" and not referenced.has(path):
					referenced.append(path)
	var all_paths: Array = []
	for entry in scene_node_map.values():
		all_paths.append_array(entry.get("paths", []))
	var missing: Array = []
	for path in referenced:
		if not all_paths.has(path):
			missing.append(path)
	return missing

func _find_duplicate_scene_roots(scene_paths: Array) -> Array:
	var root_map := {}
	for scene_path in scene_paths:
		var packed := ResourceLoader.load(scene_path)
		if packed == null or not (packed is PackedScene):
			continue
		var root := (packed as PackedScene).instantiate()
		if root == null:
			continue
		var root_name := root.name
		if not root_map.has(root_name):
			root_map[root_name] = []
		root_map[root_name].append(scene_path)
		root.queue_free()
	var duplicates: Array = []
	for key in root_map.keys():
		var entries: Array = root_map[key]
		if entries.size() > 1:
			duplicates.append("%s -> %s" % [key, ", ".join(entries)])
	return duplicates
