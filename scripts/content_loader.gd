class_name ContentLoader
extends Node

# COMO USAR:
# 1) Chame load_all() para obter o payload completo de conteúdo.
# 2) Adicione novos caminhos ao CONTENT_PATHS quando criar arquivos JSON.
# 3) Ajuste _validate_required para garantir campos mínimos.

const CONTENT_PATHS := {
  "regions": "res://data/regions.json",
  "campaign_acts": "res://data/campaign_acts.json",
  "mission_templates": "res://content/mission_templates.json",
  "enemies": "res://data/enemies.json",
  "codex_entries": "res://data/codex_entries.json",
  "items": "res://content/items.json",
  "factions": "res://content/factions.json",
  "maps": "res://content/maps.json",
  "skills": "res://content/skills.json",
  "events": "res://content/events.json"
}

func load_json(path: String) -> Dictionary:
  if not FileAccess.file_exists(path):
    push_error("ContentLoader: missing file %s" % path)
    return {}
  var file := FileAccess.open(path, FileAccess.READ)
  if file == null:
    push_error("ContentLoader: unable to open %s" % path)
    return {}
  var text := file.get_as_text()
  var parsed_value: Variant = JSON.parse_string(text)
  if parsed_value == null:
    push_error("ContentLoader: invalid JSON in %s" % path)
    return {}
  if parsed_value is Dictionary:
    return parsed_value as Dictionary
  push_error("ContentLoader: JSON root not Dictionary in %s" % path)
  return {}

func _validate_required(data: Dictionary, fields: Array, label: String) -> void:
  for field in fields:
    if not data.has(field):
      push_error("ContentLoader: %s missing field %s" % [label, field])

func load_all() -> Dictionary:
  var payload := {}
  for key in CONTENT_PATHS.keys():
    payload[key] = load_json(CONTENT_PATHS[key])
  _validate_required(payload["regions"], ["regions"], "regions.json")
  _validate_required(payload["campaign_acts"], ["acts"], "campaign_acts.json")
  _validate_required(payload["mission_templates"], ["templates"], "mission_templates.json")
  _validate_required(payload["enemies"], ["enemy_pools", "bosses"], "enemies.json")
  _validate_required(payload["codex_entries"], ["entries"], "codex_entries.json")
  _validate_required(payload["items"], ["items"], "items.json")
  _validate_required(payload["factions"], ["factions"], "factions.json")
  _validate_required(payload["maps"], ["common_map_pool", "story_maps"], "maps.json")
  _validate_required(payload["skills"], ["classes"], "skills.json")
  _validate_required(payload["events"], ["faction_events"], "events.json")
  return payload
