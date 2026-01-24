extends Node
class_name SaveSystem

const SAVE_PATH_TEMPLATE := "user://save_slot_%d.json"

var game_state: GameState

func _init(state: GameState = null) -> void:
	game_state = state

func save(slot: int = 0) -> void:
	if game_state == null:
		return
	var path = SAVE_PATH_TEMPLATE % slot
	var data = game_state.serialize()
	var json = JSON.stringify(data, "\t")
	var file = FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(json)
	file.close()

func has_save(slot: int = 0) -> bool:
	var path = SAVE_PATH_TEMPLATE % slot
	return FileAccess.file_exists(path)

func load(slot: int = 0) -> bool:
	if game_state == null:
		return false
	var path = SAVE_PATH_TEMPLATE % slot
	if not FileAccess.file_exists(path):
		return false
	var file = FileAccess.open(path, FileAccess.READ)
	if file == null:
		return false
	var content = file.get_as_text()
	file.close()
	var parsed = JSON.parse_string(content)
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	game_state.deserialize(parsed)
	return true
