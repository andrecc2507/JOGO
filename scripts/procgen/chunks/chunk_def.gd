extends Node3D
class_name ChunkDef

@export var chunk_id: String = ""
@export var biome_tags: Array[String] = []
@export var tags: Array[String] = []
@export var chunk_size: Vector2i = Vector2i(10, 10)
@export var edges := {"N": "OPEN", "E": "OPEN", "S": "OPEN", "W": "OPEN"}

func get_spawn_markers() -> Array[Marker3D]:
	var out: Array[Marker3D] = []
	var markers_root := get_node_or_null("Markers")
	if markers_root == null:
		return out
	for child in markers_root.get_children():
		if child is Marker3D and String(child.name).begins_with("Spawn"):
			out.append(child)
	return out

func get_objective_markers() -> Array[Marker3D]:
	var out: Array[Marker3D] = []
	var markers_root := get_node_or_null("Markers")
	if markers_root == null:
		return out
	for child in markers_root.get_children():
		if child is Marker3D and String(child.name).begins_with("Objective"):
			out.append(child)
	return out

func get_local_spawn_cells() -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	for marker in get_spawn_markers():
		var local_pos := marker.position
		var cell := Vector2i(int(floor(local_pos.x)), int(floor(local_pos.z)))
		cell.x = clamp(cell.x, 0, max(0, chunk_size.x - 1))
		cell.y = clamp(cell.y, 0, max(0, chunk_size.y - 1))
		cells.append(cell)
	return cells

func debug_draw_bounds() -> void:
	print("ChunkDef debug bounds: id=%s size=%s edges=%s" % [chunk_id, chunk_size, edges])
