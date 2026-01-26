extends Control

const MAP_SCREEN_SCENE := "res://scene/ui/map_screen.tscn"
const RPGClassesRef := preload("res://scripts/rpg/classes_db.gd")
const DEMO_TEMPLATE_ID := "demo_combat_loop"

@onready var title_label: Label = $Panel/Content/TitleLabel
@onready var details_label: Label = $Panel/Content/DetailsLabel
@onready var party_label: Label = $Panel/Content/PartyLabel
@onready var demo_class_section: VBoxContainer = $Panel/Content/DemoClassSection
@onready var deploy_button: Button = $Panel/Content/Buttons/DeployButton
@onready var cancel_button: Button = $Panel/Content/Buttons/CancelButton

var world_state: Node
var _card: Dictionary = {}
var _is_demo_mission := false
var _demo_class_ids: Array[String] = []
var _demo_class_selectors: Array[OptionButton] = []

func _ready() -> void:
	world_state = get_tree().get_first_node_in_group("world_state")	
	deploy_button.pressed.connect(_on_deploy_pressed)
	cancel_button.pressed.connect(_on_cancel_pressed)
	_load_pending_mission()

func _load_pending_mission() -> void:
	if world_state == null:
		return
	_card = world_state.progression.get("pending_mission_card", {})
	if _card.is_empty():
		details_label.text = "Nenhuma missão selecionada."
		deploy_button.disabled = true
		return
	_is_demo_mission = String(_card.get("template_id", "")) == DEMO_TEMPLATE_ID
	var template := _template_for_id(String(_card.get("template_id", "")))
	var mission_name := String(template.get("name", "Missão"))
	var mission_type := String(_card.get("mission_type", _card.get("type", "")))
	var region_id := String(_card.get("region_id", ""))
	var timer_minutes := int(_card.get("timer_minutes", int(_card.get("timer_days", 1)) * 1440))
	var hours_left := int(ceil(float(timer_minutes) / 60.0))
	title_label.text = "Pré-Missão — %s" % mission_name
	details_label.text = "Tipo: %s\nRegião: %s\nTimer: %dh" % [mission_type, region_id, hours_left]
	_setup_demo_class_section()
	_refresh_party()

func _refresh_party() -> void:
	if world_state == null:
		return
	if _is_demo_mission:
		var selections := _collect_demo_class_selection()
		var lines: Array[String] = []
		for i in range(selections.size()):
			lines.append("Slot %d: %s" % [i + 1, selections[i]])
		if lines.is_empty():
			party_label.text = "Escolha as classes da demo."
			deploy_button.disabled = true
		else:
			party_label.text = "Classes da demo:\n" + "\n".join(lines)
			deploy_button.disabled = false
		return
	var lines: Array[String] = []
	var party_ids: Array = world_state.active_party_ids
	for hero in world_state.roster:
		var hero_id := String(hero.get("id", ""))
		if not party_ids.has(hero_id):
			continue
		if world_state.is_unit_training(hero_id):
			continue
		lines.append("%s [%s]" % [String(hero.get("name", "Hero")), String(hero.get("class_id", ""))])
	if lines.is_empty():
		party_label.text = "Nenhum herói disponível na party."
		deploy_button.disabled = true
	else:
		party_label.text = "Party:\n" + "\n".join(lines)
		deploy_button.disabled = false

func _on_deploy_pressed() -> void:
	if world_state == null or _card.is_empty():
		return
	if _is_demo_mission:
		var selections := _collect_demo_class_selection()
		if selections.is_empty():
			return
		world_state.progression["demo_class_selection"] = selections
	var seed = world_state.build_mission_seed(_card)
	world_state.progression["pending_mission_id"] = String(_card.get("mission_id", ""))
	world_state.progression.erase("pending_mission_card")
	world_state.progression.erase("pending_mission_action")
	var bridge = get_tree().get_first_node_in_group("tactical_bridge")
	if bridge != null and bridge.has_method("start_mission"):
		bridge.start_mission(seed)
	else:
		get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _on_cancel_pressed() -> void:
	if world_state != null:
		world_state.progression.erase("pending_mission_card")
		world_state.progression.erase("pending_mission_action")
		world_state.progression.erase("demo_class_selection")
	get_tree().change_scene_to_file(MAP_SCREEN_SCENE)

func _template_for_id(template_id: String) -> Dictionary:
	if world_state == null:
		return {}
	for template in world_state.mission_templates:
		if String(template.get("id", "")) == template_id:
			return template
	return {}

func _setup_demo_class_section() -> void:
	if demo_class_section == null:
		return
	if not _is_demo_mission:
		demo_class_section.visible = false
		return
	demo_class_section.visible = true
	var class_list := demo_class_section.get_node_or_null("ClassList") as VBoxContainer
	if class_list == null:
		class_list = VBoxContainer.new()
		class_list.name = "ClassList"
		class_list.add_theme_constant_override("separation", 4)
		demo_class_section.add_child(class_list)
	for child in class_list.get_children():
		child.queue_free()
	_demo_class_selectors.clear()
	_demo_class_ids = _load_demo_class_ids()
	var default_order: Array[String] = ["GUERREIRO", "ARCANO", "ARQUEIRO", "PATRULHEIRO"]
	for i in range(4):
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var label := Label.new()
		label.text = "Slot %d" % (i + 1)
		label.custom_minimum_size = Vector2(70, 0)
		var selector := OptionButton.new()
		selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		for class_id in _demo_class_ids:
			var class_label := _label_for_class_id(class_id)
			var item_index := selector.item_count
			selector.add_item(class_label)
			selector.set_item_metadata(item_index, class_id)
		var default_id: String = ""
		if i < default_order.size():
			default_id = default_order[i]
		_select_option_by_class_id(selector, default_id)
		selector.item_selected.connect(_on_demo_class_changed)
		row.add_child(label)
		row.add_child(selector)
		class_list.add_child(row)
		_demo_class_selectors.append(selector)

func _load_demo_class_ids() -> Array[String]:
	var classes_db := RPGClassesRef.new()
	var all_classes: Dictionary = classes_db.get_all_class_data()
	var entries: Array = []
	for class_id in all_classes.keys():
		var def: Dictionary = all_classes[class_id]
		entries.append({
			"id": String(class_id),
			"label": String(def.get("label", class_id))
		})
	entries.sort_custom(func(a, b): return String(a.get("label", "")).casecmp_to(String(b.get("label", ""))) < 0)
	var ids: Array[String] = []
	for entry in entries:
		ids.append(String(entry.get("id", "")))
	return ids

func _label_for_class_id(class_id: String) -> String:
	var classes_db := RPGClassesRef.new()
	var def: Dictionary = classes_db.get_class_data(class_id)
	var label := String(def.get("label", class_id))
	if label == "":
		label = class_id
	return "%s [%s]" % [label, class_id]

func _select_option_by_class_id(selector: OptionButton, class_id: String) -> void:
	if selector == null:
		return
	if class_id == "":
		selector.select(0)
		return
	for i in range(selector.item_count):
		if String(selector.get_item_metadata(i)) == class_id:
			selector.select(i)
			return
	selector.select(0)

func _collect_demo_class_selection() -> Array[String]:
	var selections: Array[String] = []
	for selector in _demo_class_selectors:
		if selector == null:
			continue
		var idx := selector.selected
		var class_id := String(selector.get_item_metadata(idx))
		if class_id == "":
			class_id = String(selector.get_item_text(idx))
		selections.append(class_id)
	return selections

func _on_demo_class_changed(_idx: int) -> void:
	_refresh_party()
