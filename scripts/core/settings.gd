extends Node
class_name Settings

# COMO USAR:
# 1) Chame Settings.load() no menu principal.
# 2) Atualize variáveis estáticas e chame Settings.apply().
# 3) Use Settings.save() para persistir.

const SETTINGS_PATH := "user://settings.json"

static var combat_confirmations: bool = true
static var fullscreen: bool = false
static var master_volume: float = 1.0
static var mouse_sensitivity: float = 0.5
static var invert_y: bool = false

static func load() -> void:
	if not FileAccess.file_exists(SETTINGS_PATH):
		apply()
		return
	var file := FileAccess.open(SETTINGS_PATH, FileAccess.READ)
	if file == null:
		apply()
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		var data: Dictionary = parsed
		fullscreen = bool(data.get("fullscreen", fullscreen))
		master_volume = float(data.get("master_volume", master_volume))
		mouse_sensitivity = float(data.get("mouse_sensitivity", mouse_sensitivity))
		invert_y = bool(data.get("invert_y", invert_y))
		combat_confirmations = bool(data.get("combat_confirmations", combat_confirmations))
	apply()

static func save() -> void:
	var data := {
		"fullscreen": fullscreen,
		"master_volume": master_volume,
		"mouse_sensitivity": mouse_sensitivity,
		"invert_y": invert_y,
		"combat_confirmations": combat_confirmations
	}
	var file := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(data, "\t"))

static func apply() -> void:
	if fullscreen:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	var bus = AudioServer.get_bus_index("Master")
	var linear = clamp(master_volume, 0.0, 1.0)
	var db = linear_to_db(max(linear, 0.001))
	if bus >= 0:
		AudioServer.set_bus_volume_db(bus, db)
