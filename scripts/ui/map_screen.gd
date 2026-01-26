extends Control

# COMO USAR:
# 1) Abra esta cena após New Game/Load Game.
# 2) Use o Mission Board para iniciar missões e Advance Day.
# 3) Gerencie roster e prédios pelo painel direito.

const SaveManagerRef := preload("res://scripts/core/save_manager.gd")
const DiagnosticsRef := preload("res://scripts/debug/diagnostics.gd")
const UnusedAuditRef := preload("res://scripts/debug/unused_audit.gd")
const MAIN_MENU_SCENE := "res://scene/ui/main_menu.tscn"
const WEEKLY_BRIEF_SCENE := "res://scene/ui/weekly_brief.tscn"
const SKILL_WEB_SCENE := "res://scene/ui/skill_web.tscn"
const HQ_SCREEN_SCENE := "res://scene/ui/hq_screen.tscn"
const SHOP_SCREEN_SCENE := "res://scene/ui/shop_screen.tscn"
const DOJO_SCREEN_SCENE := "res://scene/ui/dojo_screen.tscn"
const RECRUIT_SCREEN_SCENE := "res://scene/ui/recruit_screen.tscn"
const TEAM_SCREEN_SCENE := "res://scene/ui/team_screen.tscn"
const PRE_MISSION_SCREEN_SCENE := "res://scene/ui/pre_mission_screen.tscn"
const MAP_TEXTURE_PATH := "res://assets/ui/world_map_provisional.png"
const ACT0_MAP_PATH := "res://content/act0_map.json"
const ACT0_RULES_PATH := "res://content/act0_rules.json"

@onready var day_label: Label = $TopBar/TimeBlock/DayLabel
@onready var act_label: Label = $TopBar/TimeBlock/ActLabel
@onready var gold_label: Label = $TopBar/ResourceBlock/GoldLabel
@onready var supplies_label: Label = $TopBar/ResourceBlock/SuppliesLabel
@onready var threat_label: Label = $TopBar/ResourceBlock/ThreatLabel
@onready var alert_label: Label = $TopBar/AlertLabel
@onready var speed_slow: Button = $BottomPanel/BottomContent/SpeedControls/SpeedSlow
@onready var speed_med: Button = $BottomPanel/BottomContent/SpeedControls/SpeedMed
@onready var speed_fast: Button = $BottomPanel/BottomContent/SpeedControls/SpeedFast
@onready var save_button: Button = $TopBar/SaveButton
@onready var menu_button: Button = $TopBar/MenuButton

@onready var roster_list: VBoxContainer = $Body/LeftPanel/RosterScroll/RosterList
@onready var party_slots: VBoxContainer = $Body/LeftPanel/PartySlots
@onready var party_header: Label = $Body/LeftPanel/PartyHeader
@onready var region_header: Button = $Body/LeftPanel/RegionHeader
@onready var left_action_buttons: HBoxContainer = $Body/LeftPanel/ActionButtons
@onready var region_scroll: ScrollContainer = $Body/LeftPanel/RegionList
@onready var region_list: VBoxContainer = $Body/LeftPanel/RegionList/RegionListVBox
@onready var faction_list: VBoxContainer = $Body/LeftPanel/FactionList
@onready var location_list: VBoxContainer = $Body/LeftPanel/LocationList
@onready var mission_list: VBoxContainer = $Body/CenterPanel/MissionScroll/MissionList

@onready var map_layer: Control = $MapLayer
@onready var map_root: Control = $MapLayer/MapRoot
@onready var map_background: ColorRect = $MapLayer/MapRoot/MapBackground
@onready var map_image: TextureRect = $MapLayer/MapRoot/MapImage
@onready var borders_layer: Node2D = $MapLayer/MapRoot/BordersLayer
@onready var location_pins_layer: Control = $MapLayer/MapRoot/LocationPins
@onready var act0_capital_pins_layer: Control = $MapLayer/MapRoot/Act0CapitalPins
@onready var act0_mission_pins_layer: Control = $MapLayer/MapRoot/Act0MissionPins
@onready var mission_pins_layer: Control = $MapLayer/MapRoot/MissionPins
@onready var building_pins_layer: Control = $MapLayer/MapRoot/BuildingPins
@onready var base_layer: Control = $BaseLayer
@onready var base_image: TextureRect = $BaseLayer/BaseImage

@onready var buildings_header: Button = $BottomPanel/BuildingsHeader
@onready var building_buttons: HBoxContainer = $BottomPanel/BottomContent/BuildingButtons
@onready var bottom_content: HBoxContainer = $BottomPanel/BottomContent
@onready var building_detail: Panel = $Body/RightPanel/BuildingDetail
@onready var detail_title: Label = $Body/RightPanel/BuildingDetail/DetailTitle
@onready var detail_scroll: ScrollContainer = $Body/RightPanel/BuildingDetail/DetailMargin/DetailScroll
@onready var detail_content: VBoxContainer = $Body/RightPanel/BuildingDetail/DetailMargin/DetailScroll/DetailContent
@onready var log_text: Label = $BottomPanel/BottomContent/LogPanel/LogMargin/LogContent/LogText
@onready var map_button: Button = $TopBar/MapButton
@onready var center_panel: VBoxContainer = $Body/CenterPanel
@onready var left_panel: VBoxContainer = $Body/LeftPanel

var world_state: Node
var save_manager := SaveManagerRef.new()
var current_building := "RosterButton"
var _time_speed_multiplier := 1
var _time_accumulator := 0.0
var _map_scale := 1.0
var _map_offset := Vector2.ZERO
var _map_dragging := false
var _map_last_mouse := Vector2.ZERO
var _map_base_size := Vector2(1024, 768)
var _region_positions: Dictionary = {}
var _act0_capital_positions: Dictionary = {}
var _mission_pin_nodes: Dictionary = {}
var _mission_card_panels: Dictionary = {}
var _mission_card_data: Dictionary = {}
var _selected_mission_id := ""
var _selected_mission_card: Dictionary = {}
var _selected_region_id := ""
var _selected_act0_capital_id := ""
var _region_buttons: Dictionary = {}
var _speed_button_group: ButtonGroup
var _mission_launch_in_progress := false
var _premission_panel: Panel
var _premission_overlay: Control
var _premission_title: Label
var _premission_details: Label
var _premission_party: Label
var _premission_confirm: Button
var _premission_action := ""
var _premission_card: Dictionary = {}
var _premission_open := false
var _tutorial_overlay: Control
var _last_action_log := ""
var _confirm_ignore_actions := true
var _regions_collapsed := false
var _buildings_collapsed := false
var _map_provisional_warned := false
var _view_mode := "map"
var _singleton_ready := false
var _act0_map_data: Dictionary = {}
var _act0_rules: Dictionary = {}

const MAP_MIN_SCALE := 0.6
const MAP_MAX_SCALE := 2.2
const REGION_FALLBACK_POS := {
	"aurea_capital": Vector2(0.55, 0.45),
	"cais_ferrugem": Vector2(0.42, 0.52),
	"mina_escarpa": Vector2(0.3, 0.62),
	"fronteira_mouro": Vector2(0.3, 0.38),
	"distrito_selo": Vector2(0.62, 0.42),
	"passagem_coroa": Vector2(0.48, 0.58),
	"suburbio_oleo": Vector2(0.6, 0.68)
}

const HAIR_STYLES := ["short", "medium", "long", "braid"]
const HAIR_COLORS := ["black", "brown", "blonde", "red", "white"]
const SKIN_TONES := ["light", "olive", "tan", "dark"]
const QUICK_TUTORIAL_STEPS := [
	"1) Escolha uma missão no Mission Board e confirme o time.",
	"2) Use o painel direito para curar, comprar e recrutar.",
	"3) Ajuste a Party no Roster (até 4 heróis).",
	"4) Avance o tempo com ▶ para gerar novos eventos."
]

func _ready() -> void:
	add_to_group("map_screen_singleton")
	var nodes := get_tree().get_nodes_in_group("map_screen_singleton")
	if nodes.size() > 1:
		push_warning("MapScreen duplicado, removendo instância extra: %s (%s)" % [str(get_instance_id()), str(scene_file_path)])
		queue_free()
		return
	_singleton_ready = true
	world_state = get_tree().get_first_node_in_group("world_state")
	_apply_ui_mouse_filters()
	if world_state != null:
		world_state.ensure_roster_seeded_if_empty()
		world_state.ensure_active_party_valid()
		world_state.refresh_shop_stock(true)
		world_state.refresh_recruits(true)
		if bool(world_state.progression.get("weekly_brief_due", false)):
			get_tree().change_scene_to_file(WEEKLY_BRIEF_SCENE)
			return
	_selected_mission_id = ""
	_selected_mission_card = {}
	_selected_region_id = ""
	_premission_open = false
	if party_header != null:
		party_header.visible = false
	_setup_collapsible_headers()
	_setup_speed_controls()
	save_button.pressed.connect(_on_save_pressed)
	menu_button.pressed.connect(_on_menu_pressed)
	if map_button != null:
		map_button.pressed.connect(_open_map_view)
	for button in building_buttons.get_children():
		if button is Button:
			button.pressed.connect(func(): _on_building_selected(button.name))
			if button.name == "CurandeiraButton":
				button.visible = false
	for button in left_action_buttons.get_children():
		if button is Button:
			if button.name == "SkillWebButton":
				button.pressed.connect(_on_skill_web_button_pressed)
			else:
				button.pressed.connect(func(): _on_building_selected(button.name))
	_load_provisional_map()
	_load_act0_content()
	_setup_map()
	_set_view_mode("map")
	_refresh_all()
	_ensure_quick_tutorial()

func _process(delta: float) -> void:
	if world_state == null:
		return
	_sync_time_speed_from_buttons()
	_time_accumulator += delta * 10.0 * float(_time_speed_multiplier)
	var minutes_to_advance := int(floor(_time_accumulator))
	if minutes_to_advance <= 0:
		return
	_time_accumulator -= minutes_to_advance
	world_state.advance_time(minutes_to_advance)
	if bool(world_state.progression.get("weekly_brief_due", false)):
		get_tree().change_scene_to_file(WEEKLY_BRIEF_SCENE)
		return
	_refresh_top_bar()
	_refresh_mission_board()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F8:
			_debug_input_state()
			return
		if event.keycode == KEY_F9:
			var ws = get_node_or_null("/root/WorldStateSingleton")
			DiagnosticsRef.print_mission_debug(ws if ws != null else world_state)
			return
		if event.keycode == KEY_F10:
			var auditor := UnusedAuditRef.new()
			auditor.run_audit()
			return
	if _premission_open:
		return
	if _view_mode == "base":
		return
	if _tutorial_overlay != null and is_instance_valid(_tutorial_overlay) and _tutorial_overlay.visible:
		return
	var hovered := _get_hovered_control()
	if hovered != null and not _is_map_hovered(hovered):
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT and _can_pan_with_left(hovered):
			_map_dragging = event.pressed
			_map_last_mouse = event.position
		elif event.button_index == MOUSE_BUTTON_MIDDLE or event.button_index == MOUSE_BUTTON_RIGHT:
			_map_dragging = event.pressed
			_map_last_mouse = event.position
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			_zoom_map(1.1, event.position)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			_zoom_map(0.9, event.position)
	elif event is InputEventMouseMotion and _map_dragging:
		var delta: Vector2 = event.position - _map_last_mouse
		_map_last_mouse = event.position
		_map_offset += delta
		_apply_map_transform()

func _get_hovered_control() -> Control:
	var vp := get_viewport()
	if vp == null:
		return null
	return vp.gui_get_hovered_control()

func _is_map_hovered(hovered: Control) -> bool:
	if hovered == null:
		return false
	if hovered == map_layer or hovered == base_layer:
		return true
	if map_layer != null and map_layer.is_ancestor_of(hovered):
		return true
	if base_layer != null and base_layer.is_ancestor_of(hovered):
		return true
	return false

func _can_pan_with_left(hovered: Control) -> bool:
	if hovered == null:
		return true
	if hovered == map_layer or hovered == map_root:
		return true
	if hovered == map_background or hovered == map_image:
		return true
	return false

func _refresh_all() -> void:
	_refresh_top_bar()
	_refresh_regions()
	_refresh_faction_legend()
	_refresh_location_legend()
	_refresh_mission_board()
	_refresh_mission_details()
	_refresh_logs()
	_update_buildings_visibility()

func _apply_ui_mouse_filters() -> void:
	var controls := [
		$TopBar,
		$Body,
		$BottomPanel
	]
	for control in controls:
		_set_mouse_filter_recursive(control, Control.MOUSE_FILTER_STOP)
	if map_layer != null:
		map_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if map_root != null:
		map_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if map_background != null:
		map_background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if map_image != null:
		map_image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if act0_capital_pins_layer != null:
		act0_capital_pins_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	if act0_mission_pins_layer != null:
		act0_mission_pins_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	if mission_pins_layer != null:
		mission_pins_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	if location_pins_layer != null:
		location_pins_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	if building_pins_layer != null:
		building_pins_layer.mouse_filter = Control.MOUSE_FILTER_STOP

func _set_mouse_filter_recursive(node: Node, filter: int) -> void:
	if node is Control:
		(node as Control).mouse_filter = filter
	for child in node.get_children():
		_set_mouse_filter_recursive(child, filter)

func _setup_collapsible_headers() -> void:
	if region_header != null:
		region_header.pressed.connect(_toggle_regions)
		region_header.mouse_filter = Control.MOUSE_FILTER_STOP
	if buildings_header != null:
		buildings_header.pressed.connect(_toggle_buildings)
		buildings_header.mouse_filter = Control.MOUSE_FILTER_STOP
	_update_regions_visibility()
	_update_buildings_visibility()

func _toggle_regions() -> void:
	_regions_collapsed = not _regions_collapsed
	_update_regions_visibility()

func _toggle_buildings() -> void:
	_buildings_collapsed = not _buildings_collapsed
	_update_buildings_visibility()

func _update_regions_visibility() -> void:
	if region_scroll != null:
		region_scroll.visible = not _regions_collapsed and _view_mode != "base"
	if region_header != null:
		var label := "Países/Capitais" if _is_act0_mode() else "Regiões"
		region_header.text = "%s %s" % [label, ("▸" if _regions_collapsed else "▾")]

func _update_buildings_visibility() -> void:
	if bottom_content != null:
		bottom_content.visible = not _buildings_collapsed
	if building_buttons != null:
		building_buttons.visible = not _buildings_collapsed
	if building_detail != null:
		building_detail.visible = not _buildings_collapsed
	if buildings_header != null:
		buildings_header.visible = true
		buildings_header.text = "Buildings %s" % ("▸" if _buildings_collapsed else "▾")

func _load_provisional_map() -> void:
	if map_image == null:
		return
	var tex := load(MAP_TEXTURE_PATH) as Texture2D
	if tex != null:
		map_image.texture = tex
		map_image.size = tex.get_size()
		if base_image != null and base_image.texture == null:
			base_image.texture = tex
		return
	if not _map_provisional_warned:
		_map_provisional_warned = true
		push_warning("MapScreen: mapa provisório não encontrado em %s" % MAP_TEXTURE_PATH)

func _load_act0_content() -> void:
	_act0_map_data = _load_json(ACT0_MAP_PATH)
	_act0_rules = _load_json(ACT0_RULES_PATH)
	if world_state != null:
		world_state.act0_map_data = _act0_map_data
		world_state.act0_rules = _act0_rules
		world_state.act0_init_from_content(_act0_map_data, _act0_rules)

func _load_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var text := file.get_as_text()
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed
	return {}

func _setup_speed_controls() -> void:
	_speed_button_group = ButtonGroup.new()
	speed_slow.button_group = _speed_button_group
	speed_med.button_group = _speed_button_group
	speed_fast.button_group = _speed_button_group
	speed_slow.button_pressed = true
	speed_slow.pressed.connect(func(): _set_time_speed(1))
	speed_med.pressed.connect(func(): _set_time_speed(10))
	speed_fast.pressed.connect(func(): _set_time_speed(50))
	speed_slow.toggled.connect(func(pressed: bool): _on_speed_toggled(pressed, 1))
	speed_med.toggled.connect(func(pressed: bool): _on_speed_toggled(pressed, 10))
	speed_fast.toggled.connect(func(pressed: bool): _on_speed_toggled(pressed, 50))
	_sync_time_speed_from_buttons()

func _on_speed_toggled(pressed: bool, multiplier: int) -> void:
	if pressed:
		_set_time_speed(multiplier)

func _sync_time_speed_from_buttons() -> void:
	if speed_fast.button_pressed:
		_set_time_speed(50)
	elif speed_med.button_pressed:
		_set_time_speed(10)
	else:
		_set_time_speed(1)

func _set_time_speed(multiplier: int) -> void:
	_time_speed_multiplier = multiplier

func _refresh_top_bar() -> void:
	if world_state == null:
		return
	var minutes = int(world_state.time_minutes)
	var hours = int(minutes / 60)
	var mins = minutes % 60
	var date_parts := _calendar_date()
	day_label.text = "Data: %02d/%02d/%04d • %02d:%02d" % [
		int(date_parts.get("day", 1)),
		int(date_parts.get("month", 1)),
		int(date_parts.get("year", 1)),
		hours,
		mins
	]
	if _is_act0_mode():
		act_label.text = "ATO 0: Pressão Territorial"
	else:
		var act = world_state.get_current_act() if world_state.has_method("get_current_act") else {}
		act_label.text = "Ato: %s" % String(act.get("id", "?"))
	gold_label.text = "Ouro: %d" % int(world_state.gold)
	var supplies := 0
	if world_state.inventory.has("supplies"):
		supplies = int(world_state.inventory.get("supplies", 0))
	else:
		var items: Array = world_state.inventory.get("items", [])
		for item_id in items:
			if String(item_id) == "medical_supplies":
				supplies += 1
	supplies_label.text = "Supplies: %d" % supplies
	threat_label.text = "Threat: %d (T%d)" % [int(world_state.global_threat), int(world_state.threat_tier)]
	var alerts = world_state.alerts
	var alert_lines: Array[String] = []
	for entry in alerts:
		var region_id = String(entry.get("region_id", ""))
		alert_lines.append("%s P:%d R:%d" % [region_id, int(entry.get("pressure", 0)), int(entry.get("rifts", 0))])
	var alert_text := "Alertas: %s" % ", ".join(alert_lines)
	if _last_action_log != "":
		alert_text = "%s | %s" % [alert_text, _last_action_log]
	alert_label.text = alert_text

func _calendar_date() -> Dictionary:
	if world_state == null:
		return {"day": 1, "month": 1, "year": 1}
	var total_days := int(world_state.day) - 1 + (int(world_state.week) - 1) * 7
	if total_days < 0:
		total_days = 0
	var year := int(floor(float(total_days) / 360.0)) + 1
	var day_of_year := int(total_days % 360)
	var month := int(floor(float(day_of_year) / 30.0)) + 1
	var day := int(day_of_year % 30) + 1
	return {"day": day, "month": month, "year": year}

func _refresh_logs() -> void:
	if world_state == null:
		return
	var entries: Array = world_state.action_log
	if entries.is_empty():
		log_text.text = "Sem ações recentes."
		return
	var lines: Array[String] = []
	for i in range(min(5, entries.size())):
		var idx := entries.size() - 1 - i
		lines.append("• %s" % String(entries[idx]))
	log_text.text = "\n".join(lines)

func _refresh_regions() -> void:
	for child in region_list.get_children():
		child.queue_free()
	_region_buttons.clear()
	if _is_act0_mode():
		_refresh_act0_regions()
		return
	if world_state == null:
		return
	var region_defs: Array = world_state.region_defs.get("regions", [])
	for region_def in region_defs:
		var region_id = String(region_def.get("id", ""))
		var region_state: Dictionary = world_state.regions.get(region_id, {})
		var tags: Array = region_def.get("tags", [])
		var factions = _factions_for_tags(tags)
		var controller_id = String(region_state.get("controller_faction_id", ""))
		var controller_name = _faction_name(controller_id)
		var relation_value = int(world_state.relations.get(controller_id, 0)) if controller_id != "" else 0
		var button := Button.new()
		button.flat = true
		button.mouse_filter = Control.MOUSE_FILTER_STOP
		button.custom_minimum_size = Vector2(0, 54)
		button.pressed.connect(func():
			_selected_region_id = region_id
			_focus_region(region_id)
			_highlight_region(region_id)
		)
		var panel_style := StyleBoxFlat.new()
		panel_style.bg_color = Color(0.08, 0.1, 0.12, 0.85)
		_set_stylebox_border_width(panel_style, 1)
		panel_style.border_color = Color(0.22, 0.32, 0.38)
		panel_style.corner_radius_top_left = 6
		panel_style.corner_radius_top_right = 6
		panel_style.corner_radius_bottom_left = 6
		panel_style.corner_radius_bottom_right = 6
		button.add_theme_stylebox_override("normal", panel_style)
		button.add_theme_stylebox_override("hover", panel_style)
		button.add_theme_stylebox_override("pressed", panel_style)
		var vbox := VBoxContainer.new()
		vbox.anchor_right = 1.0
		vbox.anchor_bottom = 1.0
		vbox.offset_left = 8
		vbox.offset_top = 6
		vbox.offset_right = -8
		vbox.offset_bottom = -6
		button.add_child(vbox)
		var title := Label.new()
		title.text = "%s | %s (%+d)" % [
			String(region_def.get("name", region_id)),
			controller_name if controller_name != "" else "Neutro",
			relation_value
		]
		vbox.add_child(title)
		var faction_label := Label.new()
		faction_label.text = "Facções: %s" % ", ".join(factions)
		faction_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
		faction_label.add_theme_font_size_override("font_size", 11)
		vbox.add_child(faction_label)
		var bars := HBoxContainer.new()
		bars.add_theme_constant_override("separation", 6)
		var pressure_bar := _mini_bar("Threat", int(region_state.get("pressure", 0)), Color(0.9, 0.3, 0.2))
		var stability_bar := _mini_bar("Stability", int(region_state.get("stability", 0)), Color(0.3, 0.8, 0.4))
		var rift_bar := _mini_bar("Rifts", int(region_state.get("rifts", 0)) * 20, Color(0.5, 0.6, 1.0))
		bars.add_child(pressure_bar)
		bars.add_child(stability_bar)
		bars.add_child(rift_bar)
		vbox.add_child(bars)
		region_list.add_child(button)
		_region_buttons[region_id] = button
	if _selected_region_id != "":
		_highlight_region(_selected_region_id)
	_update_regions_visibility()
	_spawn_location_pins()

func _refresh_faction_legend() -> void:
	if faction_list == null:
		return
	for child in faction_list.get_children():
		child.queue_free()
	if world_state == null:
		return
	var neutral_row := HBoxContainer.new()
	var neutral_swatch := ColorRect.new()
	neutral_swatch.custom_minimum_size = Vector2(12, 12)
	neutral_swatch.color = Color(0.8, 0.8, 0.8)
	neutral_row.add_child(neutral_swatch)
	var neutral_label := Label.new()
	neutral_label.text = "Neutro"
	neutral_row.add_child(neutral_label)
	faction_list.add_child(neutral_row)
	for faction in world_state.faction_defs.get("factions", []):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var swatch := ColorRect.new()
		swatch.custom_minimum_size = Vector2(12, 12)
		swatch.color = Color.html(String(faction.get("color", "#ffffff")))
		row.add_child(swatch)
		var label := Label.new()
		label.text = String(faction.get("name", faction.get("id", "")))
		row.add_child(label)
		faction_list.add_child(row)

func _refresh_location_legend() -> void:
	if location_list == null:
		return
	for child in location_list.get_children():
		child.queue_free()
	if world_state == null:
		return
	var capitals: Array[String] = []
	var ports: Array[String] = []
	var mines: Array[String] = []
	var chokepoints: Array[String] = []
	for region_def in world_state.region_defs.get("regions", []):
		var tags: Array = region_def.get("tags", [])
		var region_name := String(region_def.get("name", region_def.get("id", "")))
		if tags.has("capital"):
			capitals.append(region_name)
		if tags.has("port") or tags.has("trade"):
			ports.append(region_name)
		if tags.has("resource"):
			mines.append(region_name)
		if tags.has("choke"):
			chokepoints.append(region_name)
	var entries := [
		{"title": "Capitais", "items": capitals},
		{"title": "Portos", "items": ports},
		{"title": "Minas", "items": mines},
		{"title": "Gargalos", "items": chokepoints}
	]
	for entry in entries:
		var label := Label.new()
		var items: Array = entry.get("items", [])
		label.text = "%s: %s" % [
			String(entry.get("title", "")),
			", ".join(items) if not items.is_empty() else "—"
		]
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		location_list.add_child(label)

func _is_act0_mode() -> bool:
	return world_state != null and world_state.act0_enabled and not _act0_map_data.is_empty()

func _refresh_act0_regions() -> void:
	if world_state == null or _act0_map_data.is_empty():
		return
	for country in _act0_map_data.get("countries", []):
		_add_act0_country_button(country)
	var neutral: Dictionary = _act0_map_data.get("neutral", {})
	if not neutral.is_empty():
		_add_act0_country_button(neutral)
	if _selected_region_id != "":
		_highlight_region(_selected_region_id)
	_update_regions_visibility()

func _add_act0_country_button(country: Dictionary) -> void:
	var country_id := String(country.get("id", ""))
	if country_id == "":
		return
	var country_state: Dictionary = world_state.act0_country_state.get(country_id, {})
	var pressure := int(country_state.get("pressure", 0))
	var button := Button.new()
	button.flat = true
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.custom_minimum_size = Vector2(0, 48)
	button.pressed.connect(func():
		_selected_region_id = country_id
		_selected_act0_capital_id = ""
		_selected_mission_id = ""
		_selected_mission_card = {}
		_refresh_mission_details()
		_apply_mission_filters()
	)
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.08, 0.1, 0.12, 0.85)
	_set_stylebox_border_width(panel_style, 1)
	panel_style.border_color = Color(0.22, 0.32, 0.38)
	panel_style.corner_radius_top_left = 6
	panel_style.corner_radius_top_right = 6
	panel_style.corner_radius_bottom_left = 6
	panel_style.corner_radius_bottom_right = 6
	button.add_theme_stylebox_override("normal", panel_style)
	button.add_theme_stylebox_override("hover", panel_style)
	button.add_theme_stylebox_override("pressed", panel_style)
	var vbox := VBoxContainer.new()
	vbox.anchor_right = 1.0
	vbox.anchor_bottom = 1.0
	vbox.offset_left = 8
	vbox.offset_top = 6
	vbox.offset_right = -8
	vbox.offset_bottom = -6
	button.add_child(vbox)
	var title := Label.new()
	title.text = "%s | Pressão %d" % [String(country.get("name", country_id)), pressure]
	vbox.add_child(title)
	var capital_names: Array[String] = []
	for capital in country.get("capitals", []):
		capital_names.append(String(capital.get("name", capital.get("id", ""))))
	var subtitle := Label.new()
	subtitle.text = "Capitais: %s" % ", ".join(capital_names)
	subtitle.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	subtitle.add_theme_font_size_override("font_size", 11)
	vbox.add_child(subtitle)
	region_list.add_child(button)
	_region_buttons[country_id] = button

func _factions_for_tags(tags: Array) -> Array[String]:
	var out: Array[String] = []
	if world_state == null:
		return out
	var factions: Array = world_state.faction_defs.get("factions", [])
	for faction in factions:
		var faction_tags: Array = faction.get("agenda_tags", faction.get("region_tags", []))
		for tag in tags:
			if faction_tags.has(tag):
				out.append(String(faction.get("name", faction.get("id", ""))))
				break
	return out

func _faction_name(faction_id: String) -> String:
	if world_state == null:
		return ""
	for faction in world_state.faction_defs.get("factions", []):
		if String(faction.get("id", "")) == faction_id:
			return String(faction.get("name", faction_id))
	return faction_id

func _refresh_mission_board() -> void:
	for child in mission_pins_layer.get_children():
		child.queue_free()
	for child in act0_mission_pins_layer.get_children():
		child.queue_free()
	_mission_pin_nodes.clear()
	_mission_card_panels.clear()
	_mission_card_data.clear()
	if world_state == null:
		return
	if world_state.mission_board.cards.is_empty():
		_selected_mission_id = ""
		_selected_mission_card = {}
		_refresh_mission_details()
		return
	for card in world_state.mission_board.cards:
		var mission_id := String(card.get("mission_id", ""))
		var card_snapshot: Dictionary = card.duplicate(true)
		_mission_card_data[mission_id] = card_snapshot
	rebuild_mission_pins()
	if _selected_mission_id != "":
		if _mission_card_data.has(_selected_mission_id):
			select_mission(_selected_mission_id)
		else:
			_selected_mission_id = ""
			_selected_mission_card = {}
			_refresh_mission_details()
	elif _selected_region_id != "":
		_apply_mission_filters()

func rebuild_mission_pins() -> void:
	for child in mission_pins_layer.get_children():
		child.queue_free()
	for child in act0_mission_pins_layer.get_children():
		child.queue_free()
	_mission_pin_nodes.clear()
	for card in _mission_card_data.values():
		_spawn_mission_pin(card)

func _template_for_id(template_id: String) -> Dictionary:
	for template in world_state.mission_templates:
		if String(template.get("id", "")) == template_id:
			return template
	return {}

func _on_do_mission(card: Dictionary) -> void:
	if world_state == null:
		return
	if _is_act0_card(card):
		_apply_act0_do(card)
		return
	_open_pre_mission_screen(card)

func _on_ignore_mission(card: Dictionary) -> void:
	if world_state == null:
		return
	if _is_act0_card(card):
		_apply_act0_ignore(card)
		return
	_apply_ignore_card(card)

func _open_pre_mission_screen(card: Dictionary) -> void:
	if world_state == null:
		return
	world_state.progression["pending_mission_card"] = card.duplicate(true)
	world_state.progression["pending_mission_action"] = "DO"
	get_tree().change_scene_to_file(PRE_MISSION_SCREEN_SCENE)

func _on_save_pressed() -> void:
	save_manager.save_campaign(0)

func _on_menu_pressed() -> void:
	get_tree().change_scene_to_file(MAIN_MENU_SCENE)

func _on_building_selected(name: String) -> void:
	current_building = name
	_open_building_screen(name)

func _open_building_screen(name: String) -> void:
	match name:
		"HeadquartersButton":
			get_tree().change_scene_to_file(HQ_SCREEN_SCENE)
		"LojaButton":
			get_tree().change_scene_to_file(SHOP_SCREEN_SCENE)
		"DojoButton":
			get_tree().change_scene_to_file(DOJO_SCREEN_SCENE)
		"RecrutarButton":
			get_tree().change_scene_to_file(RECRUIT_SCREEN_SCENE)
		"RosterButton":
			get_tree().change_scene_to_file(TEAM_SCREEN_SCENE)
		"CurandeiraButton":
			get_tree().change_scene_to_file(HQ_SCREEN_SCENE)
		_:
			return

func _show_building(name: String) -> void:
	for child in detail_content.get_children():
		child.queue_free()
	if name == "HeadquartersButton":
		detail_title.text = "Headquarters"
		_build_headquarters_detail()
	elif name == "CurandeiraButton":
		detail_title.text = "Curandeira"
		_build_healer_detail()
	elif name == "LojaButton":
		detail_title.text = "Loja"
		_build_shop_detail()
	elif name == "DojoButton":
		detail_title.text = "Dojo"
		_build_dojo_detail()
	elif name == "RecrutarButton":
		detail_title.text = "Recrutar"
		_build_recruit_detail()
	else:
		detail_title.text = "Roster / Party"
		_build_roster_detail()

func _refresh_mission_details() -> void:
	for child in detail_content.get_children():
		child.queue_free()
	if _selected_mission_card.is_empty():
		if _selected_act0_capital_id != "":
			_render_act0_capital_detail()
			return
		detail_title.text = "Missão"
		var placeholder := Label.new()
		placeholder.text = "Selecione uma missão no mapa."
		placeholder.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		detail_content.add_child(placeholder)
		return
	var card := _selected_mission_card
	var template := _template_for_id(String(card.get("template_id", "")))
	var mission_name := String(template.get("name", card.get("name", "Missão")))
	var mission_type := String(card.get("mission_type", card.get("type", "")))
	var region_id := String(card.get("region_id", ""))
	var faction_name := _faction_name(String(card.get("source_faction_id", card.get("faction_id", ""))))
	var timer_minutes := int(card.get("timer_minutes", int(card.get("timer_days", 1)) * 1440))
	var hours_left := int(ceil(float(timer_minutes) / 60.0))
	var reward_data: Dictionary = card.get("reward", {})
	var location_label := "País" if card.has("country_id") else "Região"
	var location_value := String(card.get("country_id", region_id))
	detail_title.text = mission_name
	var info := Label.new()
	info.text = "Tipo: %s\n%s: %s\nFacção: %s\nExpira em: %dh (ignorada)" % [
		mission_type,
		location_label,
		location_value,
		faction_name if faction_name != "" else "Neutro",
		hours_left
	]
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_content.add_child(info)
	var description := String(card.get("description", ""))
	if description != "":
		var desc_label := Label.new()
		desc_label.text = description
		desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		detail_content.add_child(desc_label)
	var tags: Array = card.get("tags", [])
	if tags.is_empty():
		tags = [mission_type]
	var tag_line := Label.new()
	tag_line.text = "Tags: %s" % ", ".join(tags)
	tag_line.add_theme_color_override("font_color", Color(0.75, 0.82, 0.9))
	detail_content.add_child(tag_line)
	var risk_value := int(card.get("risk", 0))
	var risk_label := Label.new()
	risk_label.text = "Risk: %d" % risk_value
	detail_content.add_child(risk_label)
	var reward_label := Label.new()
	var reward_items := ""
	if reward_data.has("item"):
		reward_items = " + %s" % String(reward_data.get("item", ""))
	reward_label.text = "Recompensa: Ouro %d%s" % [int(reward_data.get("gold", 0)), reward_items]
	detail_content.add_child(reward_label)
	var summary := Label.new()
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var do_summary := String(card.get("do_summary", ""))
	var ignore_summary := String(card.get("ignore_summary", ""))
	summary.text = "DO: %s\nIGNORE: %s" % [
		do_summary if do_summary != "" else "ver efeitos",
		ignore_summary if ignore_summary != "" else "ver efeitos"
	]
	detail_content.add_child(summary)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 8)
	var do_button := Button.new()
	do_button.text = "DO"
	do_button.custom_minimum_size = Vector2(140, 40)
	do_button.add_theme_font_size_override("font_size", 14)
	do_button.pressed.connect(_on_do_mission.bind(card.duplicate(true)))
	var ignore_button := Button.new()
	ignore_button.text = "IGNORE"
	ignore_button.custom_minimum_size = Vector2(140, 40)
	ignore_button.add_theme_font_size_override("font_size", 14)
	ignore_button.pressed.connect(_on_ignore_mission.bind(card.duplicate(true)))
	buttons.add_child(do_button)
	buttons.add_child(ignore_button)
	detail_content.add_child(buttons)

func _render_act0_capital_detail() -> void:
	if world_state == null:
		return
	var capital_state: Dictionary = world_state.act0_capital_state.get(_selected_act0_capital_id, {})
	var country_id := String(capital_state.get("country_id", ""))
	var country_state: Dictionary = world_state.act0_country_state.get(country_id, {})
	var capital_name := String(capital_state.get("name", _selected_act0_capital_id))
	var country_name := String(country_state.get("name", country_id))
	detail_title.text = capital_name
	var info := Label.new()
	info.text = "País: %s\nPressão: %d\nPressão média: %d" % [
		country_name if country_name != "" else "Neutro",
		int(capital_state.get("pressure", 0)),
		int(country_state.get("pressure", 0))
	]
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_content.add_child(info)
	var mission_card := _find_mission_for_capital(_selected_act0_capital_id)
	if not mission_card.is_empty():
		var template := _template_for_id(String(mission_card.get("template_id", "")))
		var mission_name := String(template.get("name", mission_card.get("name", "Missão")))
		var mission_label := Label.new()
		mission_label.text = "Missão disponível: %s" % mission_name
		detail_content.add_child(mission_label)
		var launch_button := Button.new()
		launch_button.text = "Launch mission"
		launch_button.pressed.connect(_on_do_mission.bind(mission_card.duplicate(true)))
		detail_content.add_child(launch_button)

func _find_mission_for_capital(capital_id: String) -> Dictionary:
	if capital_id == "":
		return {}
	for card in _mission_card_data.values():
		if String(card.get("capital_id", "")) == capital_id:
			return card
	return {}

func _build_healer_detail() -> void:
	if world_state == null:
		return
	var injured = world_state.get_injured_heroes()
	if injured.is_empty():
		var label := Label.new()
		label.text = "Sem feridos."
		detail_content.add_child(label)
	else:
		for hero in injured:
			var row := HBoxContainer.new()
			var label := Label.new()
			label.text = "%s (%d ferimentos)" % [String(hero.get("name", "Hero")), hero.get("injuries", []).size()]
			var button := Button.new()
			button.text = "Tratar"
			button.pressed.connect(func():
				if world_state.treat_hero(String(hero.get("id", ""))):
					_refresh_all()
			)
			row.add_child(label)
			row.add_child(button)
			detail_content.add_child(row)
	var hint := Label.new()
	hint.text = "Use as setas de tempo no menu inferior para acelerar a recuperação."
	detail_content.add_child(hint)

func _build_shop_detail() -> void:
	if world_state == null:
		return
	var gold_label_local := Label.new()
	gold_label_local.text = "Ouro disponível: %d" % int(world_state.gold)
	detail_content.add_child(gold_label_local)
	var stock_label := Label.new()
	stock_label.text = "Estoque diário"
	detail_content.add_child(stock_label)
	for item_id in world_state.get_shop_stock():
		var item = world_state.get_item_data(String(item_id))
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s (%d)" % [String(item.get("name", item_id)), int(item.get("price", 0))]
		var button := Button.new()
		button.text = "Comprar"
		button.pressed.connect(func():
			if world_state.purchase_item(String(item_id)):
				_refresh_all()
		)
		row.add_child(label)
		row.add_child(button)
		detail_content.add_child(row)
	var inv_label := Label.new()
	inv_label.text = "Inventário"
	detail_content.add_child(inv_label)
	var inv_items: Array = world_state.inventory.get("items", [])
	for inv_id in inv_items:
		var item_data = world_state.get_item_data(String(inv_id))
		var row2 := HBoxContainer.new()
		var label2 := Label.new()
		label2.text = "%s" % String(item_data.get("name", inv_id))
		var sell := Button.new()
		sell.text = "Vender"
		sell.pressed.connect(func():
			if world_state.sell_item(String(inv_id)):
				_refresh_all()
		)
		row2.add_child(label2)
		row2.add_child(sell)
		detail_content.add_child(row2)

func _build_dojo_detail() -> void:
	if world_state == null:
		return
	_build_unit_dojo(detail_content)

func _build_general_skills(container: VBoxContainer) -> void:
	if world_state == null:
		return
	var header := Label.new()
	header.text = "General XP: %d" % int(world_state.get_general_state().get("xp", 0))
	container.add_child(header)
	var bonuses: Dictionary = world_state.get_general_bonus_summary()
	var bonus_label := Label.new()
	bonus_label.text = "Bônus ativos: PA %+d | Aim %+d | Ouro %+d%% | Recuperação %+d%%" % [
		int(bonuses.get("party_pa_max", 0)),
		int(bonuses.get("party_aim_bonus", 0)),
		int(bonuses.get("gold_reward_pct", 0)),
		int(bonuses.get("wound_recovery_pct", 0))
	]
	container.add_child(bonus_label)
	var tree: Dictionary = world_state.get_general_skill_tree()
	var unlocked: Array = world_state.get_general_state().get("skills_unlocked", [])
	for line in tree.get("lines", []):
		var line_label := Label.new()
		line_label.text = "Linha: %s" % String(line.get("name", ""))
		container.add_child(line_label)
		for skill in line.get("skills", []):
			var row := HBoxContainer.new()
			var skill_id := String(skill.get("id", ""))
			var cost = int(skill.get("xp_cost", 0))
			var status = "Desbloqueada" if unlocked.has(skill_id) else "Bloqueada"
			var label := Label.new()
			label.text = "%s (XP %d) - %s" % [String(skill.get("name", "")), cost, status]
			var button := Button.new()
			button.text = "Desbloquear"
			button.disabled = unlocked.has(skill_id) or int(world_state.get_general_state().get("xp", 0)) < cost
			button.pressed.connect(func():
				if world_state.unlock_general_skill(skill_id):
					_show_building(current_building)
			)
			row.add_child(label)
			row.add_child(button)
			container.add_child(row)

func _build_unit_dojo(container: VBoxContainer) -> void:
	if world_state == null:
		return
	var roster = world_state.roster
	if roster.is_empty():
		var empty_label := Label.new()
		empty_label.text = "Sem heróis no roster."
		container.add_child(empty_label)
		return
	var customization := VBoxContainer.new()
	var skill_tree := VBoxContainer.new()
	var customization_title := Label.new()
	customization_title.text = "Personalização"
	customization.add_child(customization_title)
	container.add_child(customization)
	container.add_child(skill_tree)

	var hero_select := OptionButton.new()
	for i in range(roster.size()):
		hero_select.add_item(String(roster[i].get("name", "Hero")), i)
	customization.add_child(hero_select)

	var preview_label := Label.new()
	customization.add_child(preview_label)

	var hair_style := OptionButton.new()
	for style in HAIR_STYLES:
		hair_style.add_item(style)
	customization.add_child(_labelled_row("Hair Style", hair_style))

	var hair_color := OptionButton.new()
	for color in HAIR_COLORS:
		hair_color.add_item(color)
	customization.add_child(_labelled_row("Hair Color", hair_color))

	var skin_tone := OptionButton.new()
	for tone in SKIN_TONES:
		skin_tone.add_item(tone)
	customization.add_child(_labelled_row("Skin Tone", skin_tone))

	var save_button_local := Button.new()
	save_button_local.text = "Salvar"
	customization.add_child(save_button_local)

	var refresh_preview := func() -> void:
		if roster.is_empty():
			return
		var hero = roster[hero_select.selected]
		var cosmetics: Dictionary = hero.get("cosmetics", {})
		preview_label.text = "Cosméticos: %s" % cosmetics

	hero_select.item_selected.connect(func(_idx):
		refresh_preview.call()
		_build_skill_tree(skill_tree, roster[hero_select.selected])
	)
	save_button_local.pressed.connect(func():
		if roster.is_empty():
			return
		var hero = roster[hero_select.selected]
		hero["cosmetics"] = {
			"hair_style": HAIR_STYLES[hair_style.selected],
			"hair_color": HAIR_COLORS[hair_color.selected],
			"skin_tone": SKIN_TONES[skin_tone.selected]
		}
		for visual in get_tree().get_nodes_in_group("character_visual"):
			if visual.get_meta("hero_id", "") == hero.get("id", "") and visual.has_method("apply_cosmetics"):
				visual.apply_cosmetics(hero["cosmetics"])
		refresh_preview.call()
	)

	refresh_preview.call()
	_build_skill_tree(skill_tree, roster[0] if roster.size() > 0 else {})

func _build_skill_tree(container: VBoxContainer, hero: Dictionary) -> void:
	for child in container.get_children():
		child.queue_free()
	if hero.is_empty() or world_state == null:
		return
	var class_id := String(hero.get("class_id", ""))
	var tree: Dictionary = world_state.get_skill_tree_for_class(class_id)
	var header := Label.new()
	header.text = "Classe %s" % class_id
	container.add_child(header)
	var unlocked: Array = hero.get("skills_unlocked", [])
	for line in tree.get("lines", []):
		var line_label := Label.new()
		line_label.text = "Linha: %s" % String(line.get("name", ""))
		container.add_child(line_label)
		for skill in line.get("skills", []):
			var row := HBoxContainer.new()
			var skill_id = String(skill.get("id", ""))
			var label := Label.new()
			var req = int(skill.get("level_req", 0))
			var status = "Desbloqueada" if unlocked.has(skill_id) else "Bloqueada"
			label.text = "%s (lvl %d) - %s" % [String(skill.get("name", "")), req, status]
			var button := Button.new()
			button.text = "Desbloquear"
			button.disabled = unlocked.has(skill_id) or int(hero.get("level", 1)) < req
			button.pressed.connect(func():
				unlocked.append(skill_id)
				hero["skills_unlocked"] = unlocked
				_build_skill_tree(container, hero)
			)
			row.add_child(label)
			row.add_child(button)
			container.add_child(row)

func _build_recruit_detail() -> void:
	if world_state == null:
		return
	var feedback := Label.new()
	feedback.text = ""
	detail_content.add_child(feedback)
	var candidates: Array = world_state.recruit_state.get("candidates", [])
	if candidates.is_empty():
		var label := Label.new()
		label.text = "Nenhum candidato hoje."
		detail_content.add_child(label)
		return
	for candidate in candidates:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s (%s) - %d ouro" % [
			String(candidate.get("name", "")),
			String(candidate.get("class_id", "")),
			int(candidate.get("recruit_cost", 0))
		]
		var button := Button.new()
		button.text = "Recrutar"
		var candidate_id := String(candidate.get("id", ""))
		button.pressed.connect(func():
			if world_state.recruit_hero(candidate_id):
				_refresh_all()
			else:
				feedback.text = "Ouro insuficiente ou candidato inválido."
		)
		row.add_child(label)
		row.add_child(button)
		detail_content.add_child(row)

func _refresh_roster_panel() -> void:
	if world_state == null:
		return
	for child in party_slots.get_children():
		child.queue_free()
	for child in roster_list.get_children():
		child.queue_free()
	var party_ids: Array = world_state.active_party_ids
	for i in range(world_state.PARTY_SIZE):
		var row := HBoxContainer.new()
		var label := Label.new()
		var hero_id := String(party_ids[i]) if i < party_ids.size() else ""
		if hero_id != "":
			var hero: Dictionary = world_state.get_roster_unit(hero_id)
			var injuries: Array = hero.get("injuries", [])
			var inj_txt := " (Ferido)" if injuries.size() > 0 else ""
			label.text = "Slot %d: %s [%s]%s" % [i + 1, String(hero.get("name", "")), String(hero.get("class_id", "")), inj_txt]
		else:
			label.text = "Slot %d: vazio" % [i + 1]
		row.add_child(label)
		party_slots.add_child(row)
	var feedback := Label.new()
	feedback.text = ""
	roster_list.add_child(feedback)
	for hero in world_state.roster:
		var row := HBoxContainer.new()
		var check := CheckBox.new()
		var hero_id := String(hero.get("id", ""))
		check.button_pressed = world_state.active_party_ids.has(hero_id)
		check.toggled.connect(_on_party_checkbox_toggled.bind(hero_id, check, feedback))
		var label := Label.new()
		var injuries = hero.get("injuries", [])
		var inj_txt = " Ferido" if injuries.size() > 0 else ""
		label.text = "%s [%s] lvl %d%s" % [String(hero.get("name", "")), String(hero.get("class_id", "")), int(hero.get("level", 1)), inj_txt]
		row.add_child(check)
		row.add_child(label)
		roster_list.add_child(row)

func _build_roster_detail() -> void:
	if world_state == null:
		return
	var note := Label.new()
	note.text = "Selecione até 4 heróis."
	detail_content.add_child(note)
	var feedback := Label.new()
	feedback.text = ""
	detail_content.add_child(feedback)
	for hero in world_state.roster:
		var row := HBoxContainer.new()
		var check := CheckBox.new()
		var hero_id = String(hero.get("id", ""))
		check.button_pressed = world_state.active_party_ids.has(hero_id)
		check.toggled.connect(_on_party_checkbox_toggled.bind(hero_id, check, feedback))
		var label := Label.new()
		var injuries = hero.get("injuries", [])
		var inj_txt = " Ferido" if injuries.size() > 0 else ""
		label.text = "%s [%s] lvl %d%s" % [String(hero.get("name", "")), String(hero.get("class_id", "")), int(hero.get("level", 1)), inj_txt]
		var skill_button := Button.new()
		skill_button.text = "Ver Skill Web"
		skill_button.pressed.connect(_open_skill_web_for_unit.bind(hero_id))
		row.add_child(check)
		row.add_child(label)
		row.add_child(skill_button)
		detail_content.add_child(row)

func _open_skill_web_for_unit(unit_id: String) -> void:
	if world_state == null or unit_id == "":
		return
	world_state.set_selected_unit(unit_id)
	get_tree().change_scene_to_file(SKILL_WEB_SCENE)

func _on_skill_web_button_pressed() -> void:
	if world_state == null:
		return
	var unit_id := String(world_state.selected_unit_id)
	if unit_id == "":
		if not world_state.active_party_ids.is_empty():
			unit_id = String(world_state.active_party_ids[0])
		elif not world_state.roster.is_empty():
			unit_id = String(world_state.roster[0].get("id", ""))
	if unit_id == "":
		return
	_open_skill_web_for_unit(unit_id)

func _on_party_checkbox_toggled(pressed: bool, hero_id: String, check: CheckBox, feedback: Label) -> void:
	if world_state == null:
		return
	var party_size := 4
	if pressed:
		if world_state.active_party_ids.has(hero_id):
			return
		if world_state.active_party_ids.size() >= party_size:
			check.set_pressed_no_signal(false)
			_flash_roster_feedback(feedback, "Party cheia.")
			return
		world_state.active_party_ids.append(hero_id)
	else:
		world_state.active_party_ids.erase(hero_id)
	world_state.ensure_active_party_valid()
	call_deferred("_refresh_roster_panel")

func _flash_roster_feedback(label: Label, message: String) -> void:
	label.text = message
	var timer = get_tree().create_timer(1.5)
	timer.timeout.connect(func():
		if is_instance_valid(label):
			label.text = ""
	)

func _labelled_row(title: String, control: Control) -> HBoxContainer:
	var row := HBoxContainer.new()
	var label := Label.new()
	label.text = title
	label.custom_minimum_size = Vector2(120, 0)
	row.add_child(label)
	row.add_child(control)
	return row

func _mini_bar(title: String, value: int, color: Color) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(0, 24)
	var label := Label.new()
	label.text = title
	label.add_theme_font_size_override("font_size", 10)
	label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	var bar := ProgressBar.new()
	bar.max_value = 100
	bar.value = clamp(value, 0, 100)
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(60, 8)
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	bar.add_theme_stylebox_override("fill", fill)
	box.add_child(label)
	box.add_child(bar)
	return box

func _style_chip(label: Label) -> void:
	var chip_style := StyleBoxFlat.new()
	chip_style.bg_color = Color(0.12, 0.14, 0.2, 0.9)
	_set_stylebox_border_width(chip_style, 1)
	chip_style.border_color = Color(0.3, 0.45, 0.6, 0.8)
	chip_style.corner_radius_top_left = 6
	chip_style.corner_radius_top_right = 6
	chip_style.corner_radius_bottom_left = 6
	chip_style.corner_radius_bottom_right = 6
	label.add_theme_stylebox_override("normal", chip_style)
	label.add_theme_color_override("font_color", Color(0.8, 0.9, 1.0))
	label.add_theme_font_size_override("font_size", 10)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.custom_minimum_size = Vector2(60, 20)

func _style_mission_card(panel: Panel) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.08, 0.1, 0.95)
	_set_stylebox_border_width(style, 1)
	style.border_color = Color(0.2, 0.35, 0.45)
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	panel.add_theme_stylebox_override("panel", style)

func _describe_effects(effects: Array) -> String:
	if effects.is_empty():
		return "Sem efeitos registrados."
	var lines: Array[String] = []
	for effect in effects:
		var effect_type := String(effect.get("type", ""))
		if effect.has("delta"):
			var delta_value: int = int(effect.get("delta", 0))
			lines.append("- %s %+d" % [effect_type, delta_value])
		else:
			lines.append("- %s" % effect_type)
	return "\n".join(lines)

func _mission_pin_color(card: Dictionary) -> Color:
	var mission_type := String(card.get("mission_type", card.get("type", ""))).to_upper()
	var risk := int(card.get("risk", 0))
	if mission_type == "PRESSURE" or String(card.get("type", "")) == "act0_pressure":
		return Color(0.95, 0.35, 0.25)
	if mission_type == "NEUTRAL" or String(card.get("type", "")) == "neutral_contract":
		return Color(0.9, 0.8, 0.3)
	if mission_type == "STEALTH":
		return Color(0.4, 0.7, 1.0)
	if risk >= 7:
		return Color(0.95, 0.35, 0.25)
	return Color(0.35, 0.9, 0.45)

func _set_stylebox_border_width(stylebox: StyleBoxFlat, width: int) -> void:
	if stylebox.has_method("set_border_width_all"):
		stylebox.set_border_width_all(width)
		return
	stylebox.border_width_left = width
	stylebox.border_width_right = width
	stylebox.border_width_top = width
	stylebox.border_width_bottom = width

func _focus_region(region_id: String) -> void:
	if not _region_positions.has(region_id):
		return
	var view_size := _get_map_view_size()
	var target: Vector2 = _region_positions[region_id]
	_map_offset = view_size * 0.5 - target * _map_scale
	_apply_map_transform()

func _setup_map() -> void:
	if map_image.texture != null:
		map_image.size = map_image.texture.get_size()
		_map_base_size = map_image.size
	else:
		_map_base_size = _get_map_view_size()
		map_image.size = _map_base_size
	if map_root != null:
		map_root.size = _map_base_size
	if map_background != null:
		map_background.size = _map_base_size
	if act0_capital_pins_layer != null:
		act0_capital_pins_layer.size = _map_base_size
	if act0_mission_pins_layer != null:
		act0_mission_pins_layer.size = _map_base_size
	if mission_pins_layer != null:
		mission_pins_layer.size = _map_base_size
	if location_pins_layer != null:
		location_pins_layer.size = _map_base_size
	if building_pins_layer != null:
		building_pins_layer.size = _map_base_size
	_build_region_positions()
	_spawn_location_pins()
	_build_act0_positions()
	_build_act0_borders()
	_build_act0_capital_pins()
	_center_map()
	_apply_map_transform()

func _build_region_positions() -> void:
	_region_positions.clear()
	if world_state == null:
		return
	var tex_size := map_image.texture.get_size() if map_image.texture != null else Vector2(1024, 768)
	for region_def in world_state.region_defs.get("regions", []):
		var region_id := String(region_def.get("id", ""))
		var pos_data: Dictionary = region_def.get("map_pos", {})
		if pos_data.is_empty():
			if REGION_FALLBACK_POS.has(region_id):
				_region_positions[region_id] = REGION_FALLBACK_POS[region_id] * tex_size
			continue
		var pos := Vector2(float(pos_data.get("x", 0.5)), float(pos_data.get("y", 0.5)))
		if pos.x <= 1.0 and pos.y <= 1.0:
			pos *= tex_size
		_region_positions[region_id] = pos

func _spawn_location_pins() -> void:
	if location_pins_layer == null:
		return
	for child in location_pins_layer.get_children():
		child.queue_free()
	if world_state == null:
		return
	for region_def in world_state.region_defs.get("regions", []):
		var region_id := String(region_def.get("id", ""))
		if not _region_positions.has(region_id):
			continue
		var tags: Array = region_def.get("tags", [])
		var location_type := ""
		var symbol := ""
		if tags.has("capital"):
			location_type = "Capital"
			symbol = "★"
		elif tags.has("port") or tags.has("trade"):
			location_type = "Porto"
			symbol = "⚓"
		elif tags.has("resource"):
			location_type = "Mina"
			symbol = "⛏"
		elif tags.has("choke"):
			location_type = "Gargalo"
			symbol = "◆"
		if symbol == "":
			continue
		var region_state: Dictionary = world_state.regions.get(region_id, {})
		var controller_id := String(region_state.get("controller_faction_id", ""))
		var pin := Button.new()
		pin.flat = true
		pin.custom_minimum_size = Vector2(18, 18)
		pin.text = symbol
		pin.add_theme_font_size_override("font_size", 12)
		pin.modulate = _faction_color(controller_id)
		pin.tooltip_text = "%s — %s\nFacção: %s" % [
			String(region_def.get("name", region_id)),
			location_type,
			_faction_name(controller_id) if controller_id != "" else "Neutro"
		]
		var pos: Vector2 = _region_positions[region_id]
		pin.position = pos - pin.custom_minimum_size * 0.5
		pin.mouse_filter = Control.MOUSE_FILTER_STOP
		location_pins_layer.add_child(pin)

func _build_act0_positions() -> void:
	_act0_capital_positions.clear()
	if _act0_map_data.is_empty():
		return
	for country in _act0_map_data.get("countries", []):
		for capital in country.get("capitals", []):
			var capital_id := String(capital.get("id", ""))
			var pos: Array = capital.get("pos", []) as Array
			if capital_id == "" or pos.size() < 2:
				continue
			var vpos := Vector2(float(pos[0]), float(pos[1]))
			_act0_capital_positions[capital_id] = vpos * _map_base_size
	var neutral: Dictionary = _act0_map_data.get("neutral", {})
	for capital in neutral.get("capitals", []):
		var capital_id := String(capital.get("id", ""))
		var pos: Array = capital.get("pos", []) as Array
		if capital_id == "" or pos.size() < 2:
			continue
		var vpos := Vector2(float(pos[0]), float(pos[1]))
		_act0_capital_positions[capital_id] = vpos * _map_base_size

func _build_act0_borders() -> void:
	if borders_layer == null:
		return
	for child in borders_layer.get_children():
		child.queue_free()
	if _act0_map_data.is_empty():
		return
	for country in _act0_map_data.get("countries", []):
		_spawn_border_line(country)
	var neutral: Dictionary = _act0_map_data.get("neutral", {})
	if not neutral.is_empty():
		_spawn_border_line(neutral)

func _spawn_border_line(entry: Dictionary) -> void:
	var poly: Array = entry.get("border_poly", [])
	if poly.is_empty():
		return
	var country_id := String(entry.get("id", ""))
	var faction_id := String(entry.get("faction_id", country_id))
	var base_color := Color.html(String(entry.get("color", "#ffffff")))
	var points: PackedVector2Array = []
	for point in poly:
		if point.size() < 2:
			continue
		var vpos := Vector2(float(point[0]), float(point[1]))
		points.append(vpos * _map_base_size)
	if points.is_empty():
		return
	var fill := Polygon2D.new()
	fill.polygon = points
	fill.color = Color(base_color, 0.12)
	fill.set_meta("faction_id", faction_id)
	fill.set_meta("country_id", country_id)
	borders_layer.add_child(fill)
	var line := Line2D.new()
	line.width = 2.0
	line.default_color = base_color
	line.closed = true
	line.points = points
	line.set_meta("faction_id", faction_id)
	line.set_meta("country_id", country_id)
	borders_layer.add_child(line)

func _build_act0_capital_pins() -> void:
	if act0_capital_pins_layer == null:
		return
	for child in act0_capital_pins_layer.get_children():
		child.queue_free()
	if _act0_map_data.is_empty():
		return
	for country in _act0_map_data.get("countries", []):
		_spawn_capital_pins(country)
	var neutral: Dictionary = _act0_map_data.get("neutral", {})
	if not neutral.is_empty():
		_spawn_capital_pins(neutral)

func _spawn_capital_pins(country: Dictionary) -> void:
	var country_id := String(country.get("id", ""))
	var country_name := String(country.get("name", country_id))
	var color := Color.html(String(country.get("color", "#ffffff")))
	for capital in country.get("capitals", []):
		var capital_id := String(capital.get("id", ""))
		if capital_id == "":
			continue
		var pos: Vector2 = _act0_capital_positions.get(capital_id, _map_base_size * 0.5)
		var pin := Button.new()
		pin.flat = true
		pin.custom_minimum_size = Vector2(12, 12)
		pin.mouse_filter = Control.MOUSE_FILTER_STOP
		pin.modulate = color
		pin.position = pos - pin.custom_minimum_size * 0.5
		pin.tooltip_text = "%s (%s)" % [String(capital.get("name", capital_id)), country_name]
		pin.pressed.connect(func():
			_selected_act0_capital_id = capital_id
			_selected_region_id = country_id
			_selected_mission_id = ""
			_selected_mission_card = {}
			_refresh_mission_details()
			_apply_mission_filters()
		)
		act0_capital_pins_layer.add_child(pin)

func _center_map() -> void:
	var view_size := _get_map_view_size()
	var tex_size := _map_base_size
	_map_scale = clamp(_map_scale, MAP_MIN_SCALE, MAP_MAX_SCALE)
	var scaled_size := tex_size * _map_scale
	_map_offset = (view_size - scaled_size) * 0.5

func _apply_map_transform() -> void:
	_map_scale = clamp(_map_scale, MAP_MIN_SCALE, MAP_MAX_SCALE)
	var view_size := _get_map_view_size()
	var tex_size := _map_base_size
	var scaled_size := tex_size * _map_scale
	var min_x: float = min(0.0, view_size.x - scaled_size.x)
	var min_y: float = min(0.0, view_size.y - scaled_size.y)
	var max_x := 0.0
	var max_y := 0.0
	_map_offset.x = clamp(_map_offset.x, min_x, max_x)
	_map_offset.y = clamp(_map_offset.y, min_y, max_y)
	if map_root != null:
		map_root.position = _map_offset
		map_root.scale = Vector2.ONE * _map_scale

func _get_map_view_size() -> Vector2:
	if map_layer != null:
		var rect := map_layer.get_rect()
		if rect.size.x > 0.0 and rect.size.y > 0.0:
			return rect.size
	return get_viewport_rect().size

func _zoom_map(factor: float, anchor: Vector2) -> void:
	var before_scale := _map_scale
	_map_scale = clamp(_map_scale * factor, MAP_MIN_SCALE, MAP_MAX_SCALE)
	var scale_ratio := _map_scale / before_scale
	_map_offset = anchor + (_map_offset - anchor) * scale_ratio
	_apply_map_transform()

func _spawn_mission_pin(card: Dictionary) -> void:
	if world_state == null:
		return
	var capital_id := String(card.get("capital_id", ""))
	var pos: Vector2 = Vector2.ZERO
	if capital_id != "" and _act0_capital_positions.has(capital_id):
		pos = _act0_capital_positions[capital_id]
	else:
		var region_id := String(card.get("region_id", ""))
		pos = _region_to_map_pos(region_id)
	var pin := Button.new()
	pin.flat = true
	pin.custom_minimum_size = Vector2(14, 14)
	pin.mouse_filter = Control.MOUSE_FILTER_STOP
	var color := _mission_pin_color(card)
	pin.modulate = color
	pin.set_meta("base_color", color)
	pin.position = pos - pin.custom_minimum_size * 0.5
	var template := _template_for_id(String(card.get("template_id", "")))
	var card_name := String(template.get("name", card.get("name", "Missão")))
	pin.tooltip_text = "%s\n%s\n%dh" % [
		card_name,
		String(card.get("mission_type", card.get("type", ""))),
		int(ceil(float(int(card.get("timer_minutes", int(card.get("timer_days", 1)) * 1440))) / 60.0))
	]
	pin.pressed.connect(func():
		var mission_id := String(card.get("mission_id", ""))
		select_mission(mission_id)
	)
	if capital_id != "" and act0_mission_pins_layer != null:
		act0_mission_pins_layer.add_child(pin)
	else:
		mission_pins_layer.add_child(pin)
	_mission_pin_nodes[String(card.get("mission_id", ""))] = pin

func _region_to_map_pos(region_id: String) -> Vector2:
	if _region_positions.has(region_id):
		return _region_positions[region_id]
	var tex_size := _map_base_size
	if REGION_FALLBACK_POS.has(region_id):
		return REGION_FALLBACK_POS[region_id] * tex_size
	return tex_size * 0.5

func _spawn_building_pins() -> void:
	for child in building_pins_layer.get_children():
		child.queue_free()
	if world_state == null:
		return
	var capital_pos := Vector2(_map_base_size.x * 0.5, _map_base_size.y * 0.5)
	for region_def in world_state.region_defs.get("regions", []):
		var tags: Array = region_def.get("tags", [])
		if tags.has("capital"):
			var region_id := String(region_def.get("id", ""))
			if _region_positions.has(region_id):
				capital_pos = _region_positions[region_id]
			break
	var base_pin := Button.new()
	base_pin.flat = true
	base_pin.custom_minimum_size = Vector2(52, 22)
	base_pin.text = "BASE"
	base_pin.add_theme_font_size_override("font_size", 12)
	base_pin.modulate = Color(0.9, 0.2, 0.2)
	base_pin.position = capital_pos - base_pin.custom_minimum_size * 0.5
	base_pin.pressed.connect(func():
		get_tree().change_scene_to_file(HQ_SCREEN_SCENE)
	)
	building_pins_layer.add_child(base_pin)

func _set_view_mode(mode: String) -> void:
	_view_mode = mode
	var is_base_view := mode == "base"
	if map_layer != null:
		map_layer.visible = not is_base_view
	if base_layer != null:
		base_layer.visible = is_base_view
	if map_button != null:
		map_button.visible = is_base_view
	if center_panel != null:
		center_panel.visible = not is_base_view and not _is_act0_mode()
	if region_header != null:
		region_header.visible = not is_base_view
	if region_scroll != null:
		region_scroll.visible = not is_base_view and not _regions_collapsed
	_update_buildings_visibility()

func _debug_input_state() -> void:
	var hovered := _get_hovered_control()
	var hovered_name: String = hovered.name if hovered != null else "none"
	var blocking := hovered != null and not _is_map_hovered(hovered)
	print("MapScreen hover=%s | map_blocked=%s" % [hovered_name, str(blocking)])

func _open_base_view() -> void:
	_set_view_mode("base")

func _open_map_view() -> void:
	_set_view_mode("map")

func _highlight_mission(mission_id: String) -> void:
	_selected_mission_id = mission_id
	_apply_mission_filters()

func select_mission(mission_id: String) -> void:
	_selected_mission_id = mission_id
	_selected_mission_card = _mission_card_data.get(mission_id, {})
	_selected_act0_capital_id = ""
	_refresh_mission_details()
	_apply_mission_filters()

func _highlight_region(region_id: String) -> void:
	_selected_region_id = region_id
	for key in _region_buttons.keys():
		var btn: Button = _region_buttons[key]
		if key == region_id:
			btn.modulate = Color(1.0, 1.0, 1.0)
		else:
			btn.modulate = Color(0.85, 0.85, 0.85)
	_apply_mission_filters()

func _apply_mission_filters() -> void:
	for key in _mission_pin_nodes.keys():
		var pin: Button = _mission_pin_nodes[key]
		var card_pin: Dictionary = _mission_card_data.get(key, {})
		var region_match = _selected_region_id == "" or String(card_pin.get("region_id", "")) == _selected_region_id
		var base_color: Color = pin.get_meta("base_color", pin.modulate)
		var pin_color := base_color
		pin_color.a = 1.0 if region_match else 0.35
		pin.modulate = pin_color
		pin.scale = Vector2.ONE * (1.3 if key == _selected_mission_id else 1.0)

func _faction_color(faction_id: String) -> Color:
	if faction_id == "":
		return Color(0.9, 0.9, 0.2)
	if world_state != null:
		for faction in world_state.faction_defs.get("factions", []):
			if String(faction.get("id", "")) == faction_id:
				var color_hex := String(faction.get("color", "#ffffff"))
				return Color.html(color_hex)
	return Color(0.8, 0.8, 0.8)

func _build_headquarters_detail() -> void:
	if world_state == null:
		return
	var overview := Label.new()
	overview.text = "Centro de comando: organize equipe, leia o briefing e revise o tutorial rápido."
	overview.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_content.add_child(overview)
	var party_title := Label.new()
	party_title.text = "Party ativa"
	detail_content.add_child(party_title)
	var party_list := Label.new()
	party_list.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var party_lines: Array[String] = []
	for hero in world_state.roster:
		if world_state.active_party_ids.has(String(hero.get("id", ""))):
			var injuries = hero.get("injuries", [])
			var inj_txt = " (Ferido)" if injuries.size() > 0 else ""
			party_lines.append("%s [%s] lvl %d%s" % [
				String(hero.get("name", "")),
				String(hero.get("class_id", "")),
				int(hero.get("level", 1)),
				inj_txt
			])
	if party_lines.is_empty():
		party_lines.append("Nenhum herói selecionado.")
	party_list.text = "\n".join(party_lines)
	detail_content.add_child(party_list)
	var tutorial_title := Label.new()
	tutorial_title.text = "Quick Tutorial"
	detail_content.add_child(tutorial_title)
	for step in QUICK_TUTORIAL_STEPS:
		var line := Label.new()
		line.text = step
		line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		detail_content.add_child(line)
	var replay_button := Button.new()
	replay_button.text = "Rever tutorial"
	replay_button.pressed.connect(_show_quick_tutorial)
	detail_content.add_child(replay_button)

func _ensure_quick_tutorial() -> void:
	if world_state == null:
		return
	if int(world_state.day) > 1:
		return
	if bool(world_state.progression.get("quick_tutorial_done", false)):
		return
	_show_quick_tutorial()

func _show_quick_tutorial() -> void:
	if _tutorial_overlay != null and is_instance_valid(_tutorial_overlay):
		_tutorial_overlay.visible = true
		return
	var overlay := ColorRect.new()
	overlay.name = "QuickTutorialOverlay"
	overlay.anchor_right = 1.0
	overlay.anchor_bottom = 1.0
	overlay.color = Color(0, 0, 0, 0.6)
	overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(overlay)
	var panel := Panel.new()
	panel.anchor_left = 0.5
	panel.anchor_top = 0.5
	panel.anchor_right = 0.5
	panel.anchor_bottom = 0.5
	panel.offset_left = -220
	panel.offset_top = -160
	panel.offset_right = 220
	panel.offset_bottom = 160
	overlay.add_child(panel)
	var vbox := VBoxContainer.new()
	vbox.anchor_right = 1.0
	vbox.anchor_bottom = 1.0
	vbox.offset_left = 16
	vbox.offset_top = 16
	vbox.offset_right = -16
	vbox.offset_bottom = -16
	panel.add_child(vbox)
	var title := Label.new()
	title.text = "Quick Tutorial"
	vbox.add_child(title)
	for step in QUICK_TUTORIAL_STEPS:
		var label := Label.new()
		label.text = step
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		vbox.add_child(label)
	var confirm := Button.new()
	confirm.text = "Entendi"
	confirm.pressed.connect(_dismiss_quick_tutorial)
	vbox.add_child(confirm)
	_tutorial_overlay = overlay

func _dismiss_quick_tutorial() -> void:
	if world_state != null:
		world_state.progression["quick_tutorial_done"] = true
	if _tutorial_overlay != null:
		_tutorial_overlay.visible = false

func _open_premission_menu(card: Dictionary) -> void:
	if world_state == null:
		return
	if _premission_action == "":
		_premission_action = "DO"
	_premission_card = card
	if _premission_panel == null or not is_instance_valid(_premission_panel):
		_build_premission_panel()
	_premission_confirm.disabled = false
	_update_premission_panel(card)
	if _premission_overlay != null:
		_premission_overlay.visible = true
	_premission_panel.visible = true
	_premission_open = true

func _build_premission_panel() -> void:
	_premission_overlay = ColorRect.new()
	_premission_overlay.name = "PreMissionOverlay"
	_premission_overlay.anchor_left = 0.0
	_premission_overlay.anchor_top = 0.0
	_premission_overlay.anchor_right = 1.0
	_premission_overlay.anchor_bottom = 1.0
	_premission_overlay.offset_left = 0.0
	_premission_overlay.offset_top = 0.0
	_premission_overlay.offset_right = 0.0
	_premission_overlay.offset_bottom = 0.0
	_premission_overlay.color = Color(0, 0, 0, 0.35)
	_premission_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	_premission_overlay.z_index = 19
	_premission_overlay.visible = false
	add_child(_premission_overlay)

	_premission_panel = Panel.new()
	_premission_panel.name = "PreMissionPanel"
	_premission_panel.anchor_left = 0.5
	_premission_panel.anchor_top = 0.5
	_premission_panel.anchor_right = 0.5
	_premission_panel.anchor_bottom = 0.5
	_premission_panel.offset_left = -260
	_premission_panel.offset_top = -200
	_premission_panel.offset_right = 260
	_premission_panel.offset_bottom = 200
	_premission_panel.visible = false
	_premission_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_premission_panel.z_index = 20
	_premission_overlay.add_child(_premission_panel)
	var vbox := VBoxContainer.new()
	vbox.anchor_right = 1.0
	vbox.anchor_bottom = 1.0
	vbox.offset_left = 16
	vbox.offset_top = 16
	vbox.offset_right = -16
	vbox.offset_bottom = -16
	_premission_panel.add_child(vbox)
	_premission_title = Label.new()
	_premission_title.text = "Pré-Missão"
	vbox.add_child(_premission_title)
	_premission_details = Label.new()
	_premission_details.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_premission_details)
	var party_title := Label.new()
	party_title.text = "Party"
	vbox.add_child(party_title)
	_premission_party = Label.new()
	_premission_party.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(_premission_party)
	var buttons := HBoxContainer.new()
	_premission_confirm = Button.new()
	_premission_confirm.text = "Iniciar"
	_premission_confirm.pressed.connect(_on_premission_confirm_pressed)
	var cancel := Button.new()
	cancel.text = "Cancelar"
	cancel.pressed.connect(_close_premission_menu)
	buttons.add_child(_premission_confirm)
	buttons.add_child(cancel)
	vbox.add_child(buttons)

func _update_premission_panel(card: Dictionary) -> void:
	var template := _template_for_id(String(card.get("template_id", "")))
	var mission_name := String(template.get("name", "Missão"))
	var mission_type := String(card.get("mission_type", card.get("type", "")))
	var timer_minutes := int(card.get("timer_minutes", int(card.get("timer_days", 1)) * 1440))
	var hours_left := int(ceil(float(timer_minutes) / 60.0))
	var reward_data: Dictionary = card.get("reward", {})
	var region_id := String(card.get("region_id", ""))
	var faction_name := _faction_name(String(card.get("source_faction_id", card.get("faction_id", ""))))
	var action_title := "Deploy Mission" if _premission_action == "DO" else "Ignore Mission"
	var effects: Dictionary = card.get("effects", {})
	var summary := String(card.get("do_summary", "")) if _premission_action == "DO" else String(card.get("ignore_summary", ""))
	var action_effects: Array = effects.get(_premission_action, [])
	var macro_effects: Array = card.get("macro_effects_do", []) if _premission_action == "DO" else card.get("macro_effects_ignore", [])
	var combined_effects: Array = []
	combined_effects.append_array(action_effects)
	combined_effects.append_array(macro_effects)
	var effects_text := summary if summary != "" else _describe_effects(combined_effects)
	var effect_label := "Consequências ao completar" if _premission_action == "DO" else "Consequências ao ignorar"
	_premission_title.text = "%s: %s" % [action_title, mission_name]
	_premission_details.text = "Tipo: %s\nRisco: %d\nRegião: %s\nFacção: %s\nTimer: %dh\nRecompensa: Ouro %d\n%s:\n%s" % [
		mission_type,
		int(card.get("risk", 0)),
		region_id,
		faction_name if faction_name != "" else "Neutro",
		hours_left,
		int(reward_data.get("gold", 0)),
		effect_label,
		effects_text
	]
	_premission_confirm.text = "Deploy" if _premission_action == "DO" else "Ignore"
	var party_lines: Array[String] = []
	for hero in world_state.roster:
		if world_state.active_party_ids.has(String(hero.get("id", ""))):
			var injuries = hero.get("injuries", [])
			var inj_txt = " (Ferido)" if injuries.size() > 0 else ""
			party_lines.append("%s [%s] lvl %d%s" % [
				String(hero.get("name", "")),
				String(hero.get("class_id", "")),
				int(hero.get("level", 1)),
				inj_txt
			])
	if party_lines.is_empty():
		party_lines.append("Nenhum herói selecionado.")
	_premission_party.text = "\n".join(party_lines)

func _on_premission_confirm_pressed() -> void:
	if _premission_action == "IGNORE":
		_confirm_ignore()
	else:
		_confirm_premission()

func _confirm_premission() -> void:
	if _mission_launch_in_progress or world_state == null:
		return
	if _premission_card.is_empty():
		return
	_mission_launch_in_progress = true
	_premission_confirm.disabled = true
	_close_premission_menu()
	var seed = world_state.build_mission_seed(_premission_card)
	world_state.log_action("DO: %s" % String(_premission_card.get("mission_id", "")))
	var bridge = get_tree().get_first_node_in_group("tactical_bridge")
	if bridge != null and bridge.has_method("start_mission"):
		world_state.progression["pending_mission_id"] = String(_premission_card.get("mission_id", ""))
		bridge.start_mission(seed)
	else:
		_mission_launch_in_progress = false
		_premission_confirm.disabled = false
		_last_action_log = "Erro: TacticalBridge não encontrado."
		_refresh_top_bar()

func _confirm_ignore() -> void:
	_apply_ignore_card(_premission_card)

func _apply_ignore_card(card: Dictionary) -> void:
	if world_state == null:
		return
	if card.is_empty():
		return
	var mission_id := String(card.get("mission_id", ""))
	var template := _template_for_id(String(card.get("template_id", "")))
	var mission_name := String(template.get("name", card.get("name", "Missão")))
	var effects: Dictionary = card.get("effects", {})
	var ignore_effects: Array = effects.get("IGNORE", [])
	for effect in ignore_effects:
		world_state.apply_effect(effect, String(card.get("region_id", "")))
	var macro_ignore: Array = card.get("macro_effects_ignore", [])
	world_state.apply_macro_effects(macro_ignore, {
		"region_id": String(card.get("region_id", "")),
		"faction_id": String(card.get("source_faction_id", card.get("faction_id", "")))
	})
	world_state.mission_board.remove_card(mission_id)
	world_state.advance_time(120)
	_last_action_log = "Ignored: %s" % mission_name
	world_state.log_action("IGNORED: %s" % mission_name)
	_close_premission_menu()
	_refresh_all()

func _is_act0_card(card: Dictionary) -> bool:
	var card_type := String(card.get("type", ""))
	return card_type == "act0_pressure" or card_type == "neutral_contract"

func _apply_act0_do(card: Dictionary) -> void:
	if card.is_empty() or world_state == null:
		return
	var mission_id := String(card.get("mission_id", ""))
	var capital_id := String(card.get("capital_id", ""))
	var mission_name := String(card.get("name", "Missão"))
	var card_type := String(card.get("type", ""))
	if card_type == "act0_pressure":
		world_state.act0_apply_do(capital_id)
		_last_action_log = "DO: %s" % mission_name
		world_state.log_action("DO: %s" % mission_name)
	elif card_type == "neutral_contract":
		var reward: Dictionary = card.get("reward", {})
		var gold_delta := int(reward.get("gold", 0))
		if gold_delta != 0:
			world_state.apply_macro_effects([{"type": "gold", "delta": gold_delta, "reason": "Contrato Interposto"}], {})
		var item_id := String(reward.get("item", ""))
		if item_id != "":
			world_state.grant_item(item_id, "Contrato Interposto")
		_last_action_log = "Contrato concluído: %s" % mission_name
		world_state.log_action("Contrato concluído: %s" % mission_name)
	world_state.mission_board.remove_card(mission_id)
	_refresh_all()

func _apply_act0_ignore(card: Dictionary) -> void:
	if card.is_empty() or world_state == null:
		return
	var mission_id := String(card.get("mission_id", ""))
	var capital_id := String(card.get("capital_id", ""))
	var mission_name := String(card.get("name", "Missão"))
	var card_type := String(card.get("type", ""))
	if card_type == "act0_pressure":
		world_state.act0_apply_ignore(capital_id)
		_last_action_log = "IGNORED: %s" % mission_name
		world_state.log_action("IGNORED: %s" % mission_name)
	elif card_type == "neutral_contract":
		_last_action_log = "Contrato ignorado: %s" % mission_name
		world_state.log_action("Contrato ignorado: %s" % mission_name)
	world_state.mission_board.remove_card(mission_id)
	_refresh_all()

func _close_premission_menu() -> void:
	if _premission_panel != null and is_instance_valid(_premission_panel):
		_premission_panel.visible = false
	if _premission_overlay != null and is_instance_valid(_premission_overlay):
		_premission_overlay.visible = false
	_premission_open = false
	_premission_action = ""
	_premission_card = {}
