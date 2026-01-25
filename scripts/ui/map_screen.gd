extends Control

# COMO USAR:
# 1) Abra esta cena após New Game/Load Game.
# 2) Use o Mission Board para iniciar missões e Advance Day.
# 3) Gerencie roster e prédios pelo painel direito.

const SaveManagerRef := preload("res://scripts/core/save_manager.gd")
const MAIN_MENU_SCENE := "res://scene/ui/main_menu.tscn"
const WEEKLY_BRIEF_SCENE := "res://scene/ui/weekly_brief.tscn"

@onready var day_label: Label = $TopBar/DayLabel
@onready var act_label: Label = $TopBar/ActLabel
@onready var gold_label: Label = $TopBar/GoldLabel
@onready var alert_label: Label = $TopBar/AlertLabel
@onready var speed_slow: Button = $TopBar/SpeedControls/SpeedSlow
@onready var speed_med: Button = $TopBar/SpeedControls/SpeedMed
@onready var speed_fast: Button = $TopBar/SpeedControls/SpeedFast
@onready var save_button: Button = $TopBar/SaveButton
@onready var menu_button: Button = $TopBar/MenuButton

@onready var region_list: VBoxContainer = $Body/LeftPanel/RegionList/RegionListVBox
@onready var mission_list: VBoxContainer = $Body/CenterPanel/MissionList

@onready var map_layer: Control = $MapLayer
@onready var map_image: TextureRect = $MapLayer/MapImage
@onready var mission_pins_layer: Control = $MapLayer/MissionPins
@onready var building_pins_layer: Control = $MapLayer/BuildingPins

@onready var building_buttons: VBoxContainer = $Body/RightPanel/BuildingButtons
@onready var detail_title: Label = $Body/RightPanel/BuildingDetail/DetailTitle
@onready var detail_scroll: ScrollContainer = $Body/RightPanel/BuildingDetail/DetailMargin/DetailScroll
@onready var detail_content: VBoxContainer = $Body/RightPanel/BuildingDetail/DetailMargin/DetailScroll/DetailContent

var world_state: Node
var save_manager := SaveManagerRef.new()
var current_building := "RosterButton"
var _time_speed_multiplier := 1
var _time_accumulator := 0.0
var _map_scale := 1.0
var _map_offset := Vector2.ZERO
var _map_dragging := false
var _map_last_mouse := Vector2.ZERO
var _region_positions: Dictionary = {}
var _mission_pin_nodes: Dictionary = {}
var _mission_card_panels: Dictionary = {}
var _selected_mission_id := ""
var _speed_button_group: ButtonGroup

const MAP_MIN_SCALE := 0.6
const MAP_MAX_SCALE := 2.2

const HAIR_STYLES := ["short", "medium", "long", "braid"]
const HAIR_COLORS := ["black", "brown", "blonde", "red", "white"]
const SKIN_TONES := ["light", "olive", "tan", "dark"]

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")
	if world_state != null:
		world_state.ensure_roster_seeded_if_empty()
		world_state.ensure_active_party_valid()
		world_state.refresh_shop_stock(true)
		world_state.refresh_recruits(true)
		if bool(world_state.progression.get("weekly_brief_due", false)):
			get_tree().change_scene_to_file(WEEKLY_BRIEF_SCENE)
			return
	_setup_speed_controls()
	save_button.pressed.connect(_on_save_pressed)
	menu_button.pressed.connect(_on_menu_pressed)
	for button in building_buttons.get_children():
		if button is Button:
			button.pressed.connect(func(): _on_building_selected(button.name))
	_setup_map()
	_refresh_all()

func _process(delta: float) -> void:
	if world_state == null:
		return
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
	if _is_mouse_over_ui():
		return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_MIDDLE:
			_map_dragging = event.pressed
			_map_last_mouse = event.position
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			_zoom_map(1.1, event.position)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			_zoom_map(0.9, event.position)
	elif event is InputEventMouseMotion and _map_dragging:
		var delta := event.position - _map_last_mouse
		_map_last_mouse = event.position
		_map_offset += delta
		_apply_map_transform()

func _is_mouse_over_ui() -> bool:
	var vp = get_viewport()
	if vp == null:
		return false
	var hovered = vp.gui_get_hovered_control()
	if hovered == null:
		return false
	if hovered is Control and hovered.mouse_filter != Control.MOUSE_FILTER_IGNORE:
		return true
	return false

func _refresh_all() -> void:
	_refresh_top_bar()
	_refresh_regions()
	_refresh_mission_board()
	_spawn_building_pins()
	_show_building(current_building)

func _setup_speed_controls() -> void:
	_speed_button_group = ButtonGroup.new()
	speed_slow.button_group = _speed_button_group
	speed_med.button_group = _speed_button_group
	speed_fast.button_group = _speed_button_group
	speed_slow.button_pressed = true
	speed_slow.pressed.connect(func(): _set_time_speed(1))
	speed_med.pressed.connect(func(): _set_time_speed(10))
	speed_fast.pressed.connect(func(): _set_time_speed(50))

func _set_time_speed(multiplier: int) -> void:
	_time_speed_multiplier = multiplier

func _refresh_top_bar() -> void:
	if world_state == null:
		return
	var minutes = int(world_state.time_minutes)
	var hours = int(minutes / 60)
	var mins = minutes % 60
	day_label.text = "Dia %d %02d:%02d / Semana %d" % [world_state.day, hours, mins, world_state.week]
	var act = world_state.get_current_act() if world_state.has_method("get_current_act") else {}
	act_label.text = "Ato: %s" % String(act.get("id", "?"))
	gold_label.text = "Ouro: %d" % int(world_state.gold)
	var alerts = world_state.alerts
	var alert_lines: Array[String] = []
	for entry in alerts:
		var region_id = String(entry.get("region_id", ""))
		alert_lines.append("%s P:%d R:%d" % [region_id, int(entry.get("pressure", 0)), int(entry.get("rifts", 0))])
	alert_label.text = "Alertas: %s" % ", ".join(alert_lines)

func _refresh_regions() -> void:
	for child in region_list.get_children():
		child.queue_free()
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
		var label := Label.new()
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.text = "%s | Pressão:%d | Rifts:%d | Controle:%s (%+d) | Facções:%s" % [
			String(region_def.get("name", region_id)),
			int(region_state.get("pressure", 0)),
			int(region_state.get("rifts", 0)),
			controller_name if controller_name != "" else "Neutro",
			relation_value,
			", ".join(factions)
		]
		region_list.add_child(label)

func _factions_for_tags(tags: Array) -> Array[String]:
	var out: Array[String] = []
	if world_state == null:
		return out
	var factions: Array = world_state.faction_defs.get("factions", [])
	for faction in factions:
		var faction_tags: Array = faction.get("region_tags", [])
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
	for child in mission_list.get_children():
		child.queue_free()
	for child in mission_pins_layer.get_children():
		child.queue_free()
	_mission_pin_nodes.clear()
	_mission_card_panels.clear()
	if world_state == null:
		return
	for card in world_state.mission_board.cards:
		var template = _template_for_id(String(card.get("template_id", "")))
		var panel := Panel.new()
		panel.custom_minimum_size = Vector2(0, 110)
		panel.mouse_filter = Control.MOUSE_FILTER_PASS
		var mission_id := String(card.get("mission_id", ""))
		panel.gui_input.connect(func(event):
			if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
				_highlight_mission(mission_id)
		)
		var vbox := VBoxContainer.new()
		panel.add_child(vbox)
		var title := Label.new()
		title.text = "%s (%s)" % [String(template.get("name", "Missão")), String(card.get("mission_type", card.get("type", "")))]
		vbox.add_child(title)
		var details := Label.new()
		var timer_minutes := int(card.get("timer_minutes", int(card.get("timer_days", 1)) * 1440))
		var hours_left := int(ceil(float(timer_minutes) / 60.0))
		var faction_id := String(card.get("faction_id", ""))
		var faction_name := _faction_name(faction_id)
		details.text = "Risco:%d | Timer:%dh | Região:%s | Facção:%s" % [
			int(card.get("risk", 0)),
			hours_left,
			String(card.get("region_id", "")),
			faction_name if faction_name != "" else "Neutro"
		]
		vbox.add_child(details)
		var reward := Label.new()
		var reward_data: Dictionary = card.get("reward", {})
		reward.text = "Recompensa: Ouro %d" % int(reward_data.get("gold", 0))
		vbox.add_child(reward)
		var buttons := HBoxContainer.new()
		var do_button := Button.new()
		do_button.text = "DO"
		do_button.pressed.connect(func(): _on_do_mission(card))
		var ignore_button := Button.new()
		ignore_button.text = "IGNORE"
		ignore_button.pressed.connect(func(): _on_ignore_mission(card))
		buttons.add_child(do_button)
		buttons.add_child(ignore_button)
		vbox.add_child(buttons)
		mission_list.add_child(panel)
		_mission_card_panels[mission_id] = panel
		_spawn_mission_pin(card)
	if _selected_mission_id != "":
		_highlight_mission(_selected_mission_id)

func _template_for_id(template_id: String) -> Dictionary:
	for template in world_state.mission_templates:
		if String(template.get("id", "")) == template_id:
			return template
	return {}

func _on_do_mission(card: Dictionary) -> void:
	if world_state == null:
		return
	var seed = world_state.build_mission_seed(card)
	var bridge = get_tree().get_first_node_in_group("tactical_bridge")
	if bridge != null and bridge.has_method("start_mission"):
		bridge.start_mission(seed)

func _on_ignore_mission(card: Dictionary) -> void:
	if world_state == null:
		return
	var effects: Dictionary = card.get("effects", {})
	var ignore_effects: Array = effects.get("IGNORE", [])
	for effect in ignore_effects:
		world_state.apply_effect(effect, String(card.get("region_id", "")))
	world_state.mission_board.remove_card(String(card.get("mission_id", "")))
	_refresh_all()

func _on_save_pressed() -> void:
	save_manager.save_campaign(0)

func _on_menu_pressed() -> void:
	get_tree().change_scene_to_file(MAIN_MENU_SCENE)

func _on_building_selected(name: String) -> void:
	current_building = name
	_show_building(name)

func _show_building(name: String) -> void:
	for child in detail_content.get_children():
		child.queue_free()
	match name:
		"CurandeiraButton":
			detail_title.text = "Curandeira"
			_build_healer_detail()
		"LojaButton":
			detail_title.text = "Loja"
			_build_shop_detail()
		"DojoButton":
			detail_title.text = "Dojo"
			_build_dojo_detail()
		"RecrutarButton":
			detail_title.text = "Recrutar"
			_build_recruit_detail()
		_:
			detail_title.text = "Roster / Party"
			_build_roster_detail()

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
	hint.text = "Use as setas de tempo no topo para acelerar a recuperação."
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
	var tab := TabContainer.new()
	tab.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_content.add_child(tab)
	var general_tab := VBoxContainer.new()
	general_tab.name = "General"
	var units_tab := VBoxContainer.new()
	units_tab.name = "Unidades"
	tab.add_child(general_tab)
	tab.add_child(units_tab)

	_build_general_skills(general_tab)
	_build_unit_dojo(units_tab)

func _build_general_skills(container: VBoxContainer) -> void:
	if world_state == null:
		return
	var header := Label.new()
	header.text = "General XP: %d" % int(world_state.get_general_state().get("xp", 0))
	container.add_child(header)
	var bonuses := world_state.get_general_bonus_summary()
	var bonus_label := Label.new()
	bonus_label.text = "Bônus ativos: PA %+d | Aim %+d | Ouro %+d%% | Recuperação %+d%%" % [
		int(bonuses.get("party_pa_max", 0)),
		int(bonuses.get("party_aim_bonus", 0)),
		int(bonuses.get("gold_reward_pct", 0)),
		int(bonuses.get("wound_recovery_pct", 0))
	]
	container.add_child(bonus_label)
	var tree := world_state.get_general_skill_tree()
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
		button.pressed.connect(func():
			if world_state.recruit_hero(String(candidate.get("id", ""))):
				_refresh_all()
		)
		row.add_child(label)
		row.add_child(button)
		detail_content.add_child(row)

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
		check.toggled.connect(func(pressed):
			_on_party_checkbox_toggled(pressed, hero_id, check, feedback)
		)
		var label := Label.new()
		var injuries = hero.get("injuries", [])
		var inj_txt = " Ferido" if injuries.size() > 0 else ""
		label.text = "%s [%s] lvl %d%s" % [String(hero.get("name", "")), String(hero.get("class_id", "")), int(hero.get("level", 1)), inj_txt]
		row.add_child(check)
		row.add_child(label)
		detail_content.add_child(row)

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
	call_deferred("_show_building", current_building)

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

func _setup_map() -> void:
	if map_image.texture != null:
		map_image.size = map_image.texture.get_size()
	_build_region_positions()
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
			continue
		var pos := Vector2(float(pos_data.get("x", 0.5)), float(pos_data.get("y", 0.5)))
		if pos.x <= 1.0 and pos.y <= 1.0:
			pos *= tex_size
		_region_positions[region_id] = pos

func _center_map() -> void:
	var view_size := get_viewport_rect().size
	var tex_size := map_image.size
	_map_scale = clamp(_map_scale, MAP_MIN_SCALE, MAP_MAX_SCALE)
	var scaled_size := tex_size * _map_scale
	_map_offset = (view_size - scaled_size) * 0.5

func _apply_map_transform() -> void:
	if map_image.texture == null:
		return
	_map_scale = clamp(_map_scale, MAP_MIN_SCALE, MAP_MAX_SCALE)
	var view_size := get_viewport_rect().size
	var tex_size := map_image.size
	var scaled_size := tex_size * _map_scale
	var min_x := min(0.0, view_size.x - scaled_size.x)
	var min_y := min(0.0, view_size.y - scaled_size.y)
	var max_x := 0.0
	var max_y := 0.0
	_map_offset.x = clamp(_map_offset.x, min_x, max_x)
	_map_offset.y = clamp(_map_offset.y, min_y, max_y)
	map_image.position = _map_offset
	map_image.scale = Vector2.ONE * _map_scale
	mission_pins_layer.size = map_image.size
	mission_pins_layer.position = _map_offset
	mission_pins_layer.scale = Vector2.ONE * _map_scale
	building_pins_layer.size = map_image.size
	building_pins_layer.position = _map_offset
	building_pins_layer.scale = Vector2.ONE * _map_scale

func _zoom_map(factor: float, anchor: Vector2) -> void:
	var before_scale := _map_scale
	_map_scale = clamp(_map_scale * factor, MAP_MIN_SCALE, MAP_MAX_SCALE)
	var scale_ratio := _map_scale / before_scale
	_map_offset = anchor + (_map_offset - anchor) * scale_ratio
	_apply_map_transform()

func _spawn_mission_pin(card: Dictionary) -> void:
	if world_state == null:
		return
	var region_id := String(card.get("region_id", ""))
	var pos: Vector2 = _region_positions.get(region_id, Vector2(map_image.size.x * 0.5, map_image.size.y * 0.5))
	var pin := Button.new()
	pin.flat = true
	pin.custom_minimum_size = Vector2(14, 14)
	var color := _faction_color(String(card.get("faction_id", "")))
	pin.modulate = color
	pin.position = pos - pin.custom_minimum_size * 0.5
	pin.pressed.connect(func():
		_highlight_mission(String(card.get("mission_id", "")))
	)
	mission_pins_layer.add_child(pin)
	_mission_pin_nodes[String(card.get("mission_id", ""))] = pin

func _spawn_building_pins() -> void:
	for child in building_pins_layer.get_children():
		child.queue_free()
	if world_state == null:
		return
	var capital_pos := Vector2(map_image.size.x * 0.5, map_image.size.y * 0.5)
	for region_def in world_state.region_defs.get("regions", []):
		var tags: Array = region_def.get("tags", [])
		if tags.has("capital"):
			var region_id := String(region_def.get("id", ""))
			if _region_positions.has(region_id):
				capital_pos = _region_positions[region_id]
			break
	var building_map := {
		"healer": "CurandeiraButton",
		"shop": "LojaButton",
		"dojo": "DojoButton",
		"recruit": "RecrutarButton",
		"roster": "RosterButton"
	}
	var idx := 0
	for building_id in building_map.keys():
		var offset := Vector2((idx % 3) * 18, int(idx / 3) * 18)
		var dot := Button.new()
		dot.flat = true
		dot.custom_minimum_size = Vector2(12, 12)
		dot.modulate = Color(0.9, 0.2, 0.2)
		dot.position = capital_pos + offset - dot.custom_minimum_size * 0.5
		var button_name = String(building_map.get(building_id, "RosterButton"))
		dot.pressed.connect(func(): _on_building_selected(button_name))
		building_pins_layer.add_child(dot)
		idx += 1

func _highlight_mission(mission_id: String) -> void:
	_selected_mission_id = mission_id
	for key in _mission_card_panels.keys():
		var panel: Panel = _mission_card_panels[key]
		panel.modulate = Color(1, 1, 1)
	for key in _mission_pin_nodes.keys():
		var pin: Button = _mission_pin_nodes[key]
		pin.scale = Vector2.ONE
	if _mission_card_panels.has(mission_id):
		var selected_panel: Panel = _mission_card_panels[mission_id]
		selected_panel.modulate = Color(1.0, 0.95, 0.7)
	if _mission_pin_nodes.has(mission_id):
		var selected_pin: Button = _mission_pin_nodes[mission_id]
		selected_pin.scale = Vector2.ONE * 1.3

func _faction_color(faction_id: String) -> Color:
	if faction_id == "":
		return Color(0.9, 0.9, 0.2)
	if world_state != null:
		for faction in world_state.faction_defs.get("factions", []):
			if String(faction.get("id", "")) == faction_id:
				var color_hex := String(faction.get("color", "#ffffff"))
				return Color.html(color_hex)
	return Color(0.8, 0.8, 0.8)
