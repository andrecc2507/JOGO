class_name ChunkDebugRunner
extends Node

const ChunkCatalogRef := preload("res://scripts/procgen/chunk_catalog.gd")
const ChunkMapGeneratorRef := preload("res://scripts/procgen/chunk_map_generator.gd")

func run_chunk_demo() -> void:
	var catalog := ChunkCatalogRef.new()
	catalog.validate_catalog()
	var generator := ChunkMapGeneratorRef.new()
	var layout := generator.generate_chunk_layout("FOREST", Vector2i(3, 3), 12345)
	if layout.is_empty():
		push_warning("ChunkDebugRunner: layout vazio.")
		return
	_print_layout(layout)
	_validate_edges(layout)
	var root := get_tree().current_scene
	if root is Node3D:
		var map_root := generator.build_scene_from_layout(layout, root, 1.0)
		if map_root != null:
			print("ChunkDebugRunner: mapa instanciado em %s." % [root.name])

func _print_layout(layout: Array) -> void:
	print("ChunkDebugRunner: layout gerado:")
	for row in layout:
		var names: Array[String] = []
		for entry in row:
			if entry is Dictionary:
				names.append(String(entry.get("id", "nil")))
			else:
				names.append("nil")
		print(" - %s" % [", ".join(names)])

func _validate_edges(layout: Array) -> void:
	var ok := true
	for y in range(layout.size()):
		var row: Array = layout[y]
		for x in range(row.size()):
			var entry: Dictionary = row[x]
			if entry.is_empty():
				ok = false
				continue
			var edges: Dictionary = entry.get("edges", {})
			if x > 0:
				var left: Dictionary = row[x - 1]
				if String(edges.get("W", "")) != String(left.get("edges", {}).get("E", "")):
					ok = false
					push_warning("ChunkDebugRunner: mismatch (%d,%d) W != left E" % [x, y])
			if y > 0:
				var up: Dictionary = layout[y - 1][x]
				if String(edges.get("N", "")) != String(up.get("edges", {}).get("S", "")):
					ok = false
					push_warning("ChunkDebugRunner: mismatch (%d,%d) N != up S" % [x, y])
	if ok:
		print("ChunkDebugRunner: edges consistentes.")
