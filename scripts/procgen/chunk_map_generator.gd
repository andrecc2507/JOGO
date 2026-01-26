extends RefCounted
class_name ChunkMapGenerator

const ChunkCatalogRef := preload("res://scripts/procgen/chunk_catalog.gd")

func generate_chunk_layout(biome_id: String, chunk_grid: Vector2i, rng_seed: int) -> Array:
	var catalog := ChunkCatalogRef.new()
	var candidates: Array = catalog.get_chunks_for_biome(biome_id)
	if candidates.is_empty():
		push_warning("ChunkMapGenerator: nenhum chunk encontrado para biome '%s'." % [biome_id])
	var layout: Array = []
	if chunk_grid.x <= 0 or chunk_grid.y <= 0:
		push_warning("ChunkMapGenerator: chunk_grid inválido %s." % [chunk_grid])
		return layout
	var rng := RandomNumberGenerator.new()
	rng.seed = rng_seed
	for y in range(chunk_grid.y):
		var row: Array = []
		for x in range(chunk_grid.x):
			var valid := _filter_by_edges(candidates, layout, row, x, y)
			if valid.is_empty():
				if not candidates.is_empty():
					push_warning("ChunkMapGenerator: fallback sem match edges em (%d,%d)." % [x, y])
					valid = candidates.duplicate()
				else:
					push_warning("ChunkMapGenerator: sem candidatos para (%d,%d); layout parcial." % [x, y])
					row.append({})
					continue
			row.append(_pick_weighted(valid, rng))
		layout.append(row)
	return layout

func build_scene_from_layout(layout: Array, parent: Node3D, cell_size: float) -> Node3D:
	if parent == null:
		return null
	var root := Node3D.new()
	root.name = "ChunkMap"
	parent.add_child(root)
	for y in range(layout.size()):
		var row: Array = layout[y]
		for x in range(row.size()):
			var entry: Dictionary = row[x]
			if entry.is_empty():
				continue
			var scene_path := String(entry.get("scene", ""))
			if scene_path == "" or not ResourceLoader.exists(scene_path):
				push_warning("ChunkMapGenerator: scene inválida (%s)." % [scene_path])
				continue
			var packed: PackedScene = load(scene_path)
			if packed == null:
				push_warning("ChunkMapGenerator: falha ao carregar %s." % [scene_path])
				continue
			var inst := packed.instantiate()
			var chunk_size: Vector2i = entry.get("chunk_size", Vector2i(10, 10))
			var offset := Vector3(
				float(x * chunk_size.x) * cell_size,
				0.0,
				float(y * chunk_size.y) * cell_size
			)
			inst.position = offset
			root.add_child(inst)
	return root

func get_default_chunk_grid_for_biome(biome_id: String, fallback: Vector2i = Vector2i(3, 3)) -> Vector2i:
	var catalog := ChunkCatalogRef.new()
	var biome := catalog.get_biome_entry(biome_id)
	if biome.is_empty():
		return fallback
	var size_raw: Array = biome.get("default_chunk_grid_size", [])
	if size_raw.size() >= 2:
		return Vector2i(int(size_raw[0]), int(size_raw[1]))
	return fallback

func get_layout_cell_bounds(layout: Array, fallback_chunk_size: Vector2i = Vector2i(10, 10)) -> Vector2i:
	var grid := Vector2i(layout.size() > 0 ? layout[0].size() : 0, layout.size())
	var chunk_size := _layout_chunk_size(layout, fallback_chunk_size)
	return Vector2i(grid.x * chunk_size.x, grid.y * chunk_size.y)

func _layout_chunk_size(layout: Array, fallback_chunk_size: Vector2i) -> Vector2i:
	for row in layout:
		if row is Array:
			for entry in row:
				if entry is Dictionary and entry.has("chunk_size"):
					return entry.get("chunk_size", fallback_chunk_size)
	return fallback_chunk_size

func _filter_by_edges(candidates: Array, layout: Array, row: Array, x: int, y: int) -> Array:
	var valid: Array = []
	for entry in candidates:
		var edges: Dictionary = entry.get("edges", {})
		var ok := true
		if x > 0:
			var left_entry: Dictionary = row[x - 1]
			if left_entry is Dictionary and not left_entry.is_empty():
				var left_edges: Dictionary = left_entry.get("edges", {})
				if String(edges.get("W", "")) != String(left_edges.get("E", "")):
					ok = false
		if y > 0:
			var up_entry: Dictionary = layout[y - 1][x]
			if up_entry is Dictionary and not up_entry.is_empty():
				var up_edges: Dictionary = up_entry.get("edges", {})
				if String(edges.get("N", "")) != String(up_edges.get("S", "")):
					ok = false
		if ok:
			valid.append(entry)
	return valid

func _pick_weighted(candidates: Array, rng: RandomNumberGenerator) -> Dictionary:
	var total := 0.0
	for entry in candidates:
		total += float(entry.get("weight", 1.0))
	if total <= 0.0:
		return candidates[0]
	var roll := rng.randf() * total
	var acc := 0.0
	for entry in candidates:
		acc += float(entry.get("weight", 1.0))
		if roll <= acc:
			return entry
	return candidates[0]
