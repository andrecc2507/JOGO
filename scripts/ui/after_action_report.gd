class_name AfterActionReport
extends Control

signal continue_pressed

@onready var outcome_label: Label = $Panel/Content/OutcomeLabel
@onready var objectives_label: Label = $Panel/Content/ObjectivesLabel
@onready var loot_label: Label = $Panel/Content/LootLabel
@onready var relations_label: Label = $Panel/Content/RelationsLabel
@onready var hero_list: VBoxContainer = $Panel/Content/HeroList
@onready var continue_button: Button = $Panel/Content/ContinueButton

func _ready() -> void:
  if continue_button != null:
    continue_button.pressed.connect(_on_continue_pressed)

func show_report(result: MissionResult, hero_deltas: Array) -> void:
  if outcome_label != null:
    outcome_label.text = "Resultado: %s" % ("Sucesso" if result.success else "Fracasso")
  if objectives_label != null:
    if result.objectives_completed.is_empty():
      objectives_label.text = "Objetivos concluídos: Nenhum"
    else:
      objectives_label.text = "Objetivos concluídos:\n- %s" % "\n- ".join(result.objectives_completed)
  if loot_label != null:
    var items: Array = result.loot.get("items", [])
    var loot_lines: Array = ["Ouro: %d" % int(result.loot.get("gold", 0))]
    if not items.is_empty():
      loot_lines.append("Itens: %s" % ", ".join(items))
    loot_label.text = "Loot:\n%s" % "\n".join(loot_lines)
  if relations_label != null:
    var relation_lines: Array = []
    for relation_id in result.relation_changes.keys():
      relation_lines.append("%s %+d" % [relation_id, int(result.relation_changes[relation_id])])
    if not result.flags_gained.is_empty():
      relation_lines.append("Flags ganhos: %s" % ", ".join(result.flags_gained))
    if not result.flags_lost.is_empty():
      relation_lines.append("Flags perdidos: %s" % ", ".join(result.flags_lost))
    relations_label.text = "Relações/Flags:\n%s" % ("\n".join(relation_lines) if not relation_lines.is_empty() else "Sem mudanças")
  if hero_list != null:
    for child in hero_list.get_children():
      child.queue_free()
    for entry in hero_deltas:
      var line = "%s | XP +%d | Nv %d→%d" % [
        String(entry.get("name", "Hero")),
        int(entry.get("xp_gain", 0)),
        int(entry.get("level_before", 1)),
        int(entry.get("level_after", 1))
      ]
      if int(entry.get("wounds_delta", 0)) > 0:
        line += " | Ferido"
      if bool(entry.get("dead", false)):
        line += " | MORTO"
      var label := Label.new()
      label.text = line
      hero_list.add_child(label)
  visible = true

func _on_continue_pressed() -> void:
  emit_signal("continue_pressed")
