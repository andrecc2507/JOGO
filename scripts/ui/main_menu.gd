extends Control

# COMO USAR:
# 1) Defina esta cena como main_scene no project.godot.
# 2) Use New Game para resetar a campanha.
# 3) Load Game carrega slots 0–2.

const SaveManagerRef := preload("res://scripts/core/save_manager.gd")
const SettingsRef := preload("res://scripts/core/settings.gd")

const MAP_SCENE := "res://scene/ui/map_screen.tscn"

@onready var new_game_button: Button = $MainLayout/ButtonContainer/NewGameButton
@onready var load_game_button: Button = $MainLayout/ButtonContainer/LoadGameButton
@onready var options_button: Button = $MainLayout/ButtonContainer/OptionsButton
@onready var quit_button: Button = $MainLayout/ButtonContainer/QuitButton

@onready var load_panel: Panel = $MainLayout/LoadPanel
@onready var load_list: VBoxContainer = $MainLayout/LoadPanel/LoadList
@onready var load_back_button: Button = $MainLayout/LoadPanel/LoadBackButton

@onready var options_panel: Panel = $MainLayout/OptionsPanel
@onready var fullscreen_check: CheckBox = $MainLayout/OptionsPanel/OptionsList/FullscreenCheck
@onready var volume_slider: HSlider = $MainLayout/OptionsPanel/OptionsList/VolumeSlider
@onready var sensitivity_slider: HSlider = $MainLayout/OptionsPanel/OptionsList/SensitivitySlider
@onready var invert_y_check: CheckBox = $MainLayout/OptionsPanel/OptionsList/InvertYCheck
@onready var options_back_button: Button = $MainLayout/OptionsPanel/OptionsBackButton

var save_manager := SaveManagerRef.new()

func _ready() -> void:
	SettingsRef.load()
	_load_panels_visibility()
	new_game_button.pressed.connect(_on_new_game_pressed)
	load_game_button.pressed.connect(_on_load_game_pressed)
	options_button.pressed.connect(_on_options_pressed)
	quit_button.pressed.connect(_on_quit_pressed)
	load_back_button.pressed.connect(_on_load_back)
	options_back_button.pressed.connect(_on_options_back)
	fullscreen_check.toggled.connect(_on_settings_changed)
	volume_slider.value_changed.connect(_on_settings_changed)
	sensitivity_slider.value_changed.connect(_on_settings_changed)
	invert_y_check.toggled.connect(_on_settings_changed)
	_sync_options_ui()
	_refresh_load_slots()

func _load_panels_visibility() -> void:
	load_panel.visible = false
	options_panel.visible = false

func _sync_options_ui() -> void:
	fullscreen_check.button_pressed = SettingsRef.fullscreen
	volume_slider.value = SettingsRef.master_volume
	sensitivity_slider.value = SettingsRef.mouse_sensitivity
	invert_y_check.button_pressed = SettingsRef.invert_y

func _refresh_load_slots() -> void:
	for child in load_list.get_children():
		child.queue_free()
	for slot in range(3):
		var summary = save_manager.get_campaign_summary(slot)
		var has_save = not summary.is_empty()
		var row := HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var label := Label.new()
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.text = "Slot %d: vazio" % slot
		if has_save:
			var day = int(summary.get("day", 0))
			var act_id = String(summary.get("act_id", ""))
			var saved_at = String(summary.get("saved_at", ""))
			label.text = "Slot %d: Dia %d | Ato %s | %s" % [slot, day, act_id if act_id != "" else "?", saved_at]
		var button := Button.new()
		button.text = "Carregar"
		button.disabled = not has_save
		button.pressed.connect(func(): _on_load_slot_pressed(slot))
		row.add_child(label)
		row.add_child(button)
		load_list.add_child(row)

func _on_new_game_pressed() -> void:
	var world_state = get_tree().get_first_node_in_group("world_state")
	if world_state != null and world_state.has_method("reset_campaign"):
		world_state.reset_campaign()
	save_manager.save_campaign(0)
	get_tree().change_scene_to_file(MAP_SCENE)

func _on_load_game_pressed() -> void:
	load_panel.visible = true
	options_panel.visible = false
	_refresh_load_slots()

func _on_load_slot_pressed(slot: int) -> void:
	if save_manager.load_campaign(slot):
		get_tree().change_scene_to_file(MAP_SCENE)

func _on_options_pressed() -> void:
	options_panel.visible = true
	load_panel.visible = false

func _on_quit_pressed() -> void:
	get_tree().quit()

func _on_load_back() -> void:
	load_panel.visible = false

func _on_options_back() -> void:
	options_panel.visible = false

func _on_settings_changed(_value := 0.0) -> void:
	SettingsRef.fullscreen = fullscreen_check.button_pressed
	SettingsRef.master_volume = float(volume_slider.value)
	SettingsRef.mouse_sensitivity = float(sensitivity_slider.value)
	SettingsRef.invert_y = invert_y_check.button_pressed
	SettingsRef.apply()
	SettingsRef.save()
