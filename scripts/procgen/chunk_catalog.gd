extends RefCounted
class_name ChunkCatalog

const BIOMES_PATH := "res://content/chunks/biomes.json"
const CATALOG_PATH := "res://content/chunks/chunk_catalog.json"

var _biomes: Dictionary = {}
var _chunks: Array = []
var _chunks_by_id: Dictionary = {}
var _loaded: bool = false

func _init() -> void:
	_load_data()

func get_chunks_for_biome(biome_id: String) -> Array:
	_load_data()
	var normalized := _normalize_biome_id(biome_id)
	if normalized == "":
		return []
	var out: Array = []
	for entry in _chunks:
		if entry.get("biomes", []).has(normalized):
			out.append(entry)
	return out

func get_chunk_entry(id: String) -> Dictionary:
	_load_data()
	return _chunks_by_id.get(id, {})

func get_biome_entry(biome_id: String) -> Dictionary:
	_load_data()
	var normalized := _normalize_biome_id(biome_id)
	return _biomes.get(normalized, {})

func validate_catalog() -> void:
	_load_data()
	if _chunks.is_empty():
		push_warning("ChunkCatalog: catálogo vazio ou não carregado.")
	for entry in _chunks:
		var cid := String(entry.get("id", ""))
		var scene_path := String(entry.get("scene", ""))
		if scene_path == "" or not ResourceLoader.exists(scene_path):
			push_warning("ChunkCatalog: scene faltando para chunk '%s' (%s)" % [cid, scene_path])
		var edges: Dictionary = entry.get("edges", {})
		for key in ["N", "E", "S", "W"]:
			if not edges.has(key):
				push_warning("ChunkCatalog: chunk '%s' sem edge '%s'." % [cid, key])
		var chunk_size: Vector2i = entry.get("chunk_size", Vector2i.ZERO)
		if chunk_size.x <= 0 or chunk_size.y <= 0:
			push_warning("ChunkCatalog: chunk '%s' com chunk_size inválido." % [cid])
		var biomes: Array = entry.get("biomes", [])
		if biomes.is_empty():
			push_warning("ChunkCatalog: chunk '%s' sem biomes." % [cid])

func _load_data() -> void:
	if _loaded:
		return
	_loaded = true
	_biomes.clear()
	_chunks.clear()
	_chunks_by_id.clear()
	_load_biomes()
	_load_chunks()

func _load_biomes() -> void:
	if not FileAccess.file_exists(BIOMES_PATH):
		push_warning("ChunkCatalog: biomes.json não encontrado (%s)." % BIOMES_PATH)
		return
	var file := FileAccess.open(BIOMES_PATH, FileAccess.READ)
	if file == null:
		push_warning("ChunkCatalog: falha ao abrir %s." % BIOMES_PATH)
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		for entry in parsed.get("biomes", []):
			var bid := _normalize_biome_id(String(entry.get("id", "")))
			if bid != "":
				_biomes[bid] = entry

func _load_chunks() -> void:
	if not FileAccess.file_exists(CATALOG_PATH):
		push_warning("ChunkCatalog: chunk_catalog.json não encontrado (%s)." % CATALOG_PATH)
		return
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		push_warning("ChunkCatalog: falha ao abrir %s." % CATALOG_PATH)
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		for raw_entry in parsed.get("chunks", []):
			if raw_entry is Dictionary:
				var entry := _normalize_entry(raw_entry)
				var cid := String(entry.get("id", ""))
				if cid != "":
					_chunks.append(entry)
					_chunks_by_id[cid] = entry

func _normalize_entry(raw_entry: Dictionary) -> Dictionary:
	var entry := raw_entry.duplicate(true)
	entry["id"] = String(entry.get("id", ""))
	entry["scene"] = String(entry.get("scene", ""))
	entry["weight"] = float(entry.get("weight", 1.0))
	var biomes: Array = []
	for biome_id in entry.get("biomes", []):
		var normalized := _normalize_biome_id(String(biome_id))
		if normalized != "":
			biomes.append(normalized)
	entry["biomes"] = biomes
	var tags: Array = []
	for tag in entry.get("tags", []):
		var t := String(tag).to_upper()
		if t != "":
			tags.append(t)
	entry["tags"] = tags
	var size_raw: Array = entry.get("chunk_size", [10, 10])
	var size_x := 10
	var size_y := 10
	if size_raw.size() >= 2:
		size_x = int(size_raw[0])
		size_y = int(size_raw[1])
	entry["chunk_size"] = Vector2i(size_x, size_y)
	var edges_raw: Dictionary = entry.get("edges", {})
	var edges := {}
	for key in ["N", "E", "S", "W"]:
		edges[key] = String(edges_raw.get(key, "OPEN")).to_upper()
	entry["edges"] = edges
	return entry

func _normalize_biome_id(biome_id: String) -> String:
	return biome_id.strip_edges().to_upper()
