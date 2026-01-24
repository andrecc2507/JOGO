extends Node3D

const GameStateRef := preload("res://scripts/core/game_state.gd")
const SaveSystemRef := preload("res://scripts/core/save_system.gd")
const GearRef := preload("res://scripts/core/gear.gd")
const MissionGeneratorRef := preload("res://scripts/tactical/mission_generator.gd")

@onready var tactical: TacticalController = $Tactical
@onready var ui_layer: CanvasLayer = $UI

var game_state: GameState
var save_system: SaveSystem

var hub_root: Control
var roster_list: VBoxContainer
var inventory_list: VBoxContainer
var mission_list: VBoxContainer
var hero_detail_label: Label
var gold_label: Label
var campaign_label: Label
var start_mission_button: Button
var save_button: Button
var new_run_button: Button
var selected_hero_id: int = -1
var selected_mission_index: int = 0

var after_action_panel: Panel
var aar_label: RichTextLabel
var aar_continue_button: Button

var available_missions: Array = []
var pending_result: Dictionary = {}

func _ready() -> void:
	game_state = GameStateRef.new()
	add_child(game_state)
	save_system = SaveSystemRef.new(game_state)
	add_child(save_system)
	if save_system.has_save(0):
		save_system.load(0)
	else:
		game_state.new_game()
		save_system.save(0)
	_ensure_hub_ui()
	_ensure_after_action_ui()
	_refresh_hub()
	_show_hub()
	if tactical:
		tactical.mission_completed.connect(_on_mission_completed)

func _ensure_hub_ui() -> void:
	if ui_layer == null:
		return
	hub_root = ui_layer.get_node_or_null("HubRoot") as Control
	if hub_root == null:
		hub_root = Control.new()
		hub_root.name = "HubRoot"
		hub_root.set_anchors_preset(Control.PRESET_FULL_RECT)
		hub_root.offset_left = 0
		hub_root.offset_top = 0
		hub_root.offset_right = 0
		hub_root.offset_bottom = 0
		ui_layer.add_child(hub_root)
	var container = hub_root.get_node_or_null("HubContainer") as HBoxContainer
	if container == null:
		container = HBoxContainer.new()
		container.name = "HubContainer"
		container.set_anchors_preset(Control.PRESET_FULL_RECT)
		container.offset_left = 24
		container.offset_top = 64
		container.offset_right = -24
		container.offset_bottom = -24
		container.add_theme_constant_override("separation", 24)
		hub_root.add_child(container)

	var header = hub_root.get_node_or_null("HubHeader") as HBoxContainer
	if header == null:
		header = HBoxContainer.new()
		header.name = "HubHeader"
		header.anchor_left = 0.0
		header.anchor_top = 0.0
		header.anchor_right = 1.0
		header.anchor_bottom = 0.0
		header.offset_left = 24
		header.offset_top = 12
		header.offset_right = -24
		header.offset_bottom = 52
		header.add_theme_constant_override("separation", 16)
		hub_root.add_child(header)

	campaign_label = header.get_node_or_null("CampaignLabel") as Label
	if campaign_label == null:
		campaign_label = Label.new()
		campaign_label.name = "CampaignLabel"
		header.add_child(campaign_label)

	start_mission_button = header.get_node_or_null("StartMissionButton") as Button
	if start_mission_button == null:
		start_mission_button = Button.new()
		start_mission_button.name = "StartMissionButton"
		start_mission_button.text = "Start Mission"
		header.add_child(start_mission_button)
		start_mission_button.pressed.connect(_on_start_selected_mission)

	save_button = header.get_node_or_null("SaveButton") as Button
	if save_button == null:
		save_button = Button.new()
		save_button.name = "SaveButton"
		save_button.text = "Save"
		header.add_child(save_button)
		save_button.pressed.connect(_on_save_pressed)

	new_run_button = header.get_node_or_null("NewRunButton") as Button
	if new_run_button == null:
		new_run_button = Button.new()
		new_run_button.name = "NewRunButton"
		new_run_button.text = "New Run"
		header.add_child(new_run_button)
		new_run_button.pressed.connect(_on_new_run_pressed)

	var roster_panel = _ensure_panel(container, "RosterPanel", "Roster")
	roster_list = roster_panel.get_node_or_null("RosterList") as VBoxContainer
	if roster_list == null:
		roster_list = VBoxContainer.new()
		roster_list.name = "RosterList"
		roster_list.add_theme_constant_override("separation", 8)
		roster_panel.add_child(roster_list)
	hero_detail_label = roster_panel.get_node_or_null("HeroDetailLabel") as Label
	if hero_detail_label == null:
		hero_detail_label = Label.new()
		hero_detail_label.name = "HeroDetailLabel"
		hero_detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		hero_detail_label.custom_minimum_size = Vector2(0, 120)
		roster_panel.add_child(hero_detail_label)
	gold_label = roster_panel.get_node_or_null("GoldLabel") as Label
	if gold_label == null:
		gold_label = Label.new()
		gold_label.name = "GoldLabel"
		roster_panel.add_child(gold_label)

	var inventory_panel = _ensure_panel(container, "InventoryPanel", "Inventário / Equipar")
	inventory_list = inventory_panel.get_node_or_null("InventoryList") as VBoxContainer
	if inventory_list == null:
		inventory_list = VBoxContainer.new()
		inventory_list.name = "InventoryList"
		inventory_list.add_theme_constant_override("separation", 8)
		inventory_panel.add_child(inventory_list)

	var mission_panel = _ensure_panel(container, "MissionPanel", "Missões")
	mission_list = mission_panel.get_node_or_null("MissionList") as VBoxContainer
	if mission_list == null:
		mission_list = VBoxContainer.new()
		mission_list.name = "MissionList"
		mission_list.add_theme_constant_override("separation", 8)
		mission_panel.add_child(mission_list)

func _ensure_after_action_ui() -> void:
	if ui_layer == null:
		return
	after_action_panel = ui_layer.get_node_or_null("AfterActionPanel") as Panel
	if after_action_panel == null:
		after_action_panel = Panel.new()
		after_action_panel.name = "AfterActionPanel"
		after_action_panel.anchor_left = 0.5
		after_action_panel.anchor_top = 0.5
		after_action_panel.anchor_right = 0.5
		after_action_panel.anchor_bottom = 0.5
		after_action_panel.offset_left = -260
		after_action_panel.offset_top = -200
		after_action_panel.offset_right = 260
		after_action_panel.offset_bottom = 200
		ui_layer.add_child(after_action_panel)
	var title = after_action_panel.get_node_or_null("Title") as Label
	if title == null:
		title = Label.new()
		title.name = "Title"
		title.text = "After Action Report"
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		title.anchor_left = 0.5
		title.anchor_right = 0.5
		title.offset_left = -180
		title.offset_right = 180
		title.offset_top = 12
		after_action_panel.add_child(title)
	var scroll = after_action_panel.get_node_or_null("Scroll") as ScrollContainer
	if scroll == null:
		scroll = ScrollContainer.new()
		scroll.name = "Scroll"
		scroll.anchor_left = 0.0
		scroll.anchor_top = 0.0
		scroll.anchor_right = 1.0
		scroll.anchor_bottom = 1.0
		scroll.offset_left = 16
		scroll.offset_top = 52
		scroll.offset_right = -16
		scroll.offset_bottom = -56
		after_action_panel.add_child(scroll)
	aar_label = scroll.get_node_or_null("ReportLabel") as RichTextLabel
	if aar_label == null:
		var report_label := RichTextLabel.new()
		report_label.name = "ReportLabel"
		report_label.fit_content = true
		report_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		report_label.scroll_active = false
		report_label.scroll_following = false
		scroll.add_child(report_label)
		aar_label = report_label
		aar_label.text = ""

	aar_continue_button = after_action_panel.get_node_or_null("ContinueButton") as Button
	if aar_continue_button == null:
		aar_continue_button = Button.new()
		aar_continue_button.name = "ContinueButton"
		aar_continue_button.text = "Continuar"
		aar_continue_button.anchor_left = 0.5
		aar_continue_button.anchor_right = 0.5
		aar_continue_button.anchor_top = 1.0
		aar_continue_button.anchor_bottom = 1.0
		aar_continue_button.offset_left = -80
		aar_continue_button.offset_right = 80
		aar_continue_button.offset_top = -44
		aar_continue_button.offset_bottom = -12
		after_action_panel.add_child(aar_continue_button)
		aar_continue_button.pressed.connect(_on_continue_after_action)
	after_action_panel.visible = false

func _ensure_panel(parent: Control, name: String, title_text: String) -> VBoxContainer:
	var panel = parent.get_node_or_null(name) as VBoxContainer
	if panel == null:
		panel = VBoxContainer.new()
		panel.name = name
		panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
		panel.add_theme_constant_override("separation", 8)
		parent.add_child(panel)
	var title = panel.get_node_or_null("Title") as Label
	if title == null:
		title = Label.new()
		title.name = "Title"
		title.text = title_text
		panel.add_child(title)
	return panel

func _refresh_hub() -> void:
	if game_state == null:
		return
	_selected_hero_from_roster()
	_refresh_roster_list()
	_refresh_inventory_list()
	_refresh_mission_list()
	gold_label.text = "Ouro: %d" % int(game_state.campaign.get("gold", 0))
	var seed = int(game_state.campaign.get("seed", 0))
	var day = int(game_state.campaign.get("day", 1))
	var completed: Array = game_state.campaign.get("completed_missions", [])
	if campaign_label != null:
		campaign_label.text = "Seed: %d | Dia: %d | Concluídas: %d" % [seed, day, completed.size()]

func _selected_hero_from_roster() -> void:
	if selected_hero_id >= 0:
		return
	for hero in game_state.heroes:
		selected_hero_id = int(hero.get("id", -1))
		break

func _refresh_roster_list() -> void:
	if roster_list == null:
		return
	for child in roster_list.get_children():
		child.queue_free()
	for hero in game_state.heroes:
		var hero_id = int(hero.get("id", -1))
		var name = String(hero.get("name", "Hero"))
		var level = int(hero.get("level", 1))
		var injured = int(hero.get("injured_for", 0))
		var button := Button.new()
		button.text = "%s (Lv %d)%s" % [name, level, " [Ferido]" if injured > 0 else ""]
		button.pressed.connect(_on_select_hero.bind(hero_id))
		roster_list.add_child(button)
	if selected_hero_id >= 0:
		_update_hero_detail(selected_hero_id)

func _update_hero_detail(hero_id: int) -> void:
	var hero = game_state.get_hero_by_id(hero_id)
	if hero.is_empty():
		hero_detail_label.text = ""
		return
	var stats: Dictionary = hero.get("stats", {})
	var gear: Dictionary = hero.get("gear", {})
	var lines: Array[String] = []
	lines.append("Nome: %s" % String(hero.get("name", "")))
	lines.append("Nível: %d | XP: %d" % [int(hero.get("level", 1)), int(hero.get("xp", 0))])
	lines.append("HP: %d | DEX: %d | AGI: %d | DEF: %d" % [
		int(stats.get("hp_max", 0)),
		int(stats.get("dex", 0)),
		int(stats.get("agi", 0)),
		int(stats.get("def", 0))
	])
	lines.append("Equip: Arma=%s | Armadura=%s | Trinket=%s" % [
		_gear_name(gear.get("weapon", null)),
		_gear_name(gear.get("armor", null)),
		_gear_name(gear.get("trinket", null))
	])
	var injured = int(hero.get("injured_for", 0))
	if injured > 0:
		lines.append("Status: Ferido (%d missões)" % injured)
	hero_detail_label.text = "\n".join(lines)

func _refresh_inventory_list() -> void:
	if inventory_list == null:
		return
	for child in inventory_list.get_children():
		child.queue_free()
	for i in range(game_state.inventory.size()):
		var item: Dictionary = game_state.inventory[i]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var label := Label.new()
		label.text = GearRef.format_item(item)
		row.add_child(label)
		var button := Button.new()
		button.text = "Equipar"
		button.disabled = selected_hero_id < 0
		button.pressed.connect(_on_equip_item.bind(i))
		row.add_child(button)
		inventory_list.add_child(row)
	if game_state.inventory.is_empty():
		var empty := Label.new()
		empty.text = "Inventário vazio"
		inventory_list.add_child(empty)

func _refresh_mission_list() -> void:
	if mission_list == null:
		return
	for child in mission_list.get_children():
		child.queue_free()
	available_missions = _generate_missions()
	for i in range(available_missions.size()):
		var mission_def: Dictionary = available_missions[i]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var button := Button.new()
		button.text = String(mission_def.get("name", "Missão"))
		button.toggle_mode = true
		button.button_pressed = i == selected_mission_index
		button.pressed.connect(_on_select_mission.bind(i))
		row.add_child(button)
		mission_list.add_child(row)

func _generate_missions() -> Array:
	var seed = int(game_state.campaign.get("seed", 0))
	var day = int(game_state.campaign.get("day", 1))
	return MissionGeneratorRef.generate_hub_missions(seed, day)

func _on_select_hero(hero_id: int) -> void:
	selected_hero_id = hero_id
	_update_hero_detail(hero_id)
	_refresh_inventory_list()

func _on_equip_item(index: int) -> void:
	if selected_hero_id < 0:
		return
	if game_state.equip_item(selected_hero_id, index):
		_refresh_hub()
		save_system.save(0)

func _on_start_mission(mission_def: Dictionary) -> void:
	_start_mission(mission_def)

func _on_start_selected_mission() -> void:
	if available_missions.is_empty():
		return
	if selected_mission_index < 0 or selected_mission_index >= available_missions.size():
		selected_mission_index = 0
	_start_mission(available_missions[selected_mission_index])

func _start_mission(mission_def: Dictionary) -> void:
	if tactical == null:
		return
	var roster := _build_deploy_roster()
	if roster.is_empty():
		roster = game_state.heroes.duplicate(true)
	hub_root.visible = false
	after_action_panel.visible = false
	pending_result = {}
	tactical.start_mission(mission_def, roster)

func _build_deploy_roster() -> Array:
	var roster: Array = []
	for hero in game_state.heroes:
		if int(hero.get("injured_for", 0)) > 0:
			continue
		roster.append(hero.duplicate(true))
	return roster

func _on_mission_completed(result: Dictionary) -> void:
	pending_result = result.duplicate(true)
	_show_after_action(result)

func _show_after_action(result: Dictionary) -> void:
	if aar_label == null:
		return
	after_action_panel.visible = true
	if hub_root:
		hub_root.visible = false
	var lines: Array[String] = []
	lines.append("[b]Resultado:[/b] %s" % ("Vitória" if result.get("victory", false) else "Derrota"))
	lines.append("[b]Motivo:[/b] %s" % String(result.get("reason", "")))
	var objectives: Array = result.get("objectives", [])
	if not objectives.is_empty():
		lines.append("\n[b]Objetivos:[/b]")
		for obj in objectives:
			lines.append("- %s" % String(obj))
	var hero_xp: Array = result.get("hero_xp", [])
	if not hero_xp.is_empty():
		lines.append("\n[b]XP por herói:[/b]")
		for entry in hero_xp:
			lines.append("- %s: +%d XP" % [String(entry.get("name", "Hero")), int(entry.get("xp", 0))])
	var loot: Array = result.get("loot", [])
	if not loot.is_empty():
		lines.append("\n[b]Loot:[/b]")
		for item in loot:
			lines.append("- %s" % GearRef.format_item(item))
	var injured: Array = result.get("injured_heroes", [])
	if not injured.is_empty():
		lines.append("\n[b]Ferimentos:[/b]")
		for hero_id in injured:
			var hero = game_state.get_hero_by_id(int(hero_id))
			lines.append("- %s" % String(hero.get("name", "Hero")))
	lines.append("\n[b]Ouro:[/b] %d" % int(result.get("gold", 0)))
	aar_label.text = "\n".join(lines)

func _on_continue_after_action() -> void:
	if pending_result.is_empty():
		_show_hub()
		return
	game_state.apply_mission_result(pending_result)
	_advance_day()
	save_system.save(0)
	pending_result = {}
	_show_hub()

func _show_hub() -> void:
	if hub_root:
		hub_root.visible = true
	if after_action_panel:
		after_action_panel.visible = false
	_refresh_hub()
	if tactical:
		tactical.end_mission_cleanup()

func _advance_day() -> void:
	game_state.campaign["day"] = int(game_state.campaign.get("day", 1)) + 1
	if int(game_state.campaign.get("day", 1)) % 7 == 0:
		game_state.campaign["week"] = int(game_state.campaign.get("week", 1)) + 1

func _on_select_mission(index: int) -> void:
	selected_mission_index = index
	_refresh_mission_list()

func _on_save_pressed() -> void:
	save_system.save(0)

func _on_new_run_pressed() -> void:
	game_state.new_game()
	save_system.save(0)
	selected_mission_index = 0
	_refresh_hub()

func _gear_name(item) -> String:
	if item == null:
		return "-"
	return String(item.get("name", "Item"))
