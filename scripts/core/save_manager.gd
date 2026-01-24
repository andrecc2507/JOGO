extends Node
class_name SaveManager

# COMO USAR:
# 1) Use save_campaign(slot) para salvar WorldState.
# 2) Use load_campaign(slot) para restaurar e validar.
# 3) Use get_campaign_summary(slot) para exibir no menu.

const SAVE_PATH_TEMPLATE := "user://campaign_slot_%d.json"

func save_campaign(slot: int) -> bool:
	var world_state = _get_world_state()
	if world_state == null:
		return false
	var payload = {
		"version": 1,
		"meta": {
			"saved_at": Time.get_datetime_string_from_system(),
			"day": world_state.day,
			"act_id": world_state.campaign_director.current_act_id if world_state.get("campaign_director") != null else ""
		},
		"state": world_state.serialize_state()
	}
	var file := FileAccess.open(SAVE_PATH_TEMPLATE % slot, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(payload, "\t"))
	return true

func load_campaign(slot: int) -> bool:
	var world_state = _get_world_state()
	if world_state == null:
		return false
	var path = SAVE_PATH_TEMPLATE % slot
	if not FileAccess.file_exists(path):
		return false
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		var data: Dictionary = parsed
		var state: Dictionary = data.get("state", {})
		world_state.deserialize_state(state)
		return true
	return false

func has_save(slot: int) -> bool:
	return FileAccess.file_exists(SAVE_PATH_TEMPLATE % slot)

func get_campaign_summary(slot: int) -> Dictionary:
	var path = SAVE_PATH_TEMPLATE % slot
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		var data: Dictionary = parsed
		return data.get("meta", {})
	return {}

func _get_world_state() -> Node:
	return get_tree().get_first_node_in_group("world_state")
