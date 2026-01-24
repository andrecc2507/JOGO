class_name ContentLoader
extends Node

const CONTENT_PATHS := {
  "regions": "res://content/regions.json",
  "campaign_acts": "res://content/campaign_acts.json",
  "mission_templates": "res://content/mission_templates.json",
  "enemies": "res://content/enemies.json",
  "codex_entries": "res://content/codex_entries.json"
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
  return payload
