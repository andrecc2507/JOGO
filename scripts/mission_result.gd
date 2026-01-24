class_name MissionResult
extends RefCounted

# COMO USAR:
# 1) Instancie com MissionResult.new(data) ao concluir o tático.
# 2) Inclua consumables_used para sincronizar inventário.
# 3) Use to_dict() para serializar resultados.

var mission_id: String
var success: bool
var time_spent_days: int
var casualties: int
var wounds: int
var loot: Dictionary
var relation_changes: Dictionary
var flags_gained: Array
var flags_lost: Array
var objectives_completed: Array
var boss_defeated: bool
var hero_results: Array
var notes: String
var consumables_used: Array

func _init(data: Dictionary) -> void:
  mission_id = String(data.get("mission_id", ""))
  success = bool(data.get("success", false))
  time_spent_days = int(data.get("time_spent_days", 1))
  casualties = int(data.get("casualties", 0))
  wounds = int(data.get("wounds", 0))
  loot = data.get("loot", {})
  relation_changes = data.get("relation_changes", {})
  flags_gained = data.get("flags_gained", [])
  flags_lost = data.get("flags_lost", [])
  objectives_completed = data.get("objectives_completed", [])
  boss_defeated = bool(data.get("boss_defeated", false))
  hero_results = data.get("hero_results", [])
  notes = String(data.get("notes", ""))
  consumables_used = data.get("consumables_used", [])

func to_dict() -> Dictionary:
  return {
    "mission_id": mission_id,
    "success": success,
    "time_spent_days": time_spent_days,
    "casualties": casualties,
    "wounds": wounds,
    "loot": loot,
    "relation_changes": relation_changes,
    "flags_gained": flags_gained,
    "flags_lost": flags_lost,
    "objectives_completed": objectives_completed,
    "boss_defeated": boss_defeated,
    "hero_results": hero_results,
    "notes": notes,
    "consumables_used": consumables_used
  }
