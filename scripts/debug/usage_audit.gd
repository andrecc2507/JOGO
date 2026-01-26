extends Node

const SCENE_ROOT := "res://scene"
const SCRIPT_ROOT := "res://scripts"
const CONTENT_ROOT := "res://content"
const OUTPUT_PATH := "user://audit_report.txt"
const SUSPECT_TOKENS := ["demo", "test", "tmp", "old", "sandbox", "placeholder"]

func run_audit() -> void:
	var referenced := {}
	var scene_refs := _collect_references_from_folder(SCENE_ROOT, [".tscn"])
	var script_refs := _collect_references_from_folder(SCRIPT_ROOT, [".gd"])
	for path in scene_refs:
		referenced[path] = true
	for path in script_refs:
		referenced[path] = true

	var all_files: Array = []
	all_files.append_array(_collect_files(SCENE_ROOT, [".tscn", ".gd"]))
	all_files.append_array(_collect_files(SCRIPT_ROOT, [".gd"]))
	all_files.append_array(_collect_files(CONTENT_ROOT, [".json"]))
	all_files.sort()

	var referenced_list: Array = referenced.keys()
	referenced_list.sort()

	var unreferenced: Array = []
	for path in all_files:
		if not referenced.has(path):
			unreferenced.append(path)

	var suspect: Array = []
	for path in all_files:
		var lowered := path.to_lower()
		for token in SUSPECT_TOKENS:
			if lowered.find(token) >= 0:
				suspect.append(path)
				break

	var report_lines: Array[String] = []
	report_lines.append("=== Usage Audit ===")
	report_lines.append("Referenced files (%d):" % referenced_list.size())
	for path in referenced_list:
		report_lines.append("- %s" % path)
	if referenced_list.is_empty():
		report_lines.append("(none)")
	report_lines.append("")
	report_lines.append("Unreferenced files (%d):" % unreferenced.size())
	for path in unreferenced:
		report_lines.append("- %s" % path)
	if unreferenced.is_empty():
		report_lines.append("(none)")
	report_lines.append("")
	report_lines.append("Suspect files (%d):" % suspect.size())
	for path in suspect:
		var flag := " (unreferenced)" if unreferenced.has(path) else ""
		report_lines.append("- %s%s" % [path, flag])
	if suspect.is_empty():
		report_lines.append("(none)")

	var report := "\n".join(report_lines)
	var file := FileAccess.open(OUTPUT_PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(report)
		file.flush()
		file.close()
	print("Usage audit saved to %s" % OUTPUT_PATH)
	print(report)

func _collect_references_from_folder(root: String, extensions: Array) -> Array:
	var refs: Array = []
	for path in _collect_files(root, extensions):
		refs.append_array(_extract_res_paths(path))
	return refs

func _collect_files(root: String, extensions: Array) -> Array:
	var results: Array = []
	var dir := DirAccess.open(root)
	if dir == null:
		return results
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if name.begins_with("."):
			name = dir.get_next()
			continue
		var path := root.path_join(name)
		if dir.current_is_dir():
			results.append_array(_collect_files(path, extensions))
		else:
			for ext in extensions:
				if path.ends_with(ext):
					results.append(path)
					break
		name = dir.get_next()
	dir.list_dir_end()
	return results

func _extract_res_paths(path: String) -> Array:
	var results: Array = []
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return results
	var content := file.get_as_text()
	file.close()
	var regex := RegEx.new()
	regex.compile("res://[^\"\\s]+")
	var matches := regex.search_all(content)
	for match in matches:
		var res_path := String(match.get_string())
		results.append(res_path)
	return results
