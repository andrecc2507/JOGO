extends Node
class_name TimelineManager

signal active_unit_changed(u: Unit)
signal turn_ending(u: Unit)
signal active_unit_swapped(previous: Unit, current: Unit)

var _units: Array[Unit] = []
var _time: Dictionary = {} # Unit -> float
var _active: Unit = null

@export var tick_per_turn: float = 100.0

var activation_count: int = 0


func register_unit(u: Unit) -> void:
	if u == null or _units.has(u):
		return
	_units.append(u)
	_time[u] = 0.0
	if _active == null:
		_pick_next_active()

func reset() -> void:
	_units.clear()
	_time.clear()
	_active = null
	activation_count = 0


func unregister_unit(u: Unit) -> void:
	if u == null:
		return
	_units.erase(u)
	_time.erase(u)
	if _active == u:
		_active = null
		_pick_next_active()


func get_active_unit() -> Unit:
	return _active

func get_turn_preview(count: int = 6) -> Array[Unit]:
	var units := _units.filter(func(u): return u != null and not u.dead)
	if units.is_empty() or count <= 0:
		return []

	var time := _time.duplicate()
	var preview: Array[Unit] = []
	var active: Unit = _active

	for _i in range(count):
		if active == null:
			active = _pick_next_candidate(units, time)
		if active == null:
			break
		preview.append(active)
		var spd = max(1, active.speed)
		var cost = tick_per_turn / float(spd)
		time[active] = float(time.get(active, 0.0)) + cost
		active = null

	return preview

func can_swap_with_next_same_team(team_id: int) -> bool:
	if _active == null:
		return false
	if _active.team != team_id:
		return false
	var preview = get_turn_preview(2)
	if preview.size() < 2:
		return false
	var next_unit: Unit = preview[1]
	if next_unit == null:
		return false
	return next_unit.team == team_id

func swap_with_next_same_team(team_id: int) -> bool:
	if not can_swap_with_next_same_team(team_id):
		return false
	var preview = get_turn_preview(2)
	var next_unit: Unit = preview[1]
	if next_unit == null:
		return false
	var previous = _active
	var t_active = float(_time.get(_active, 0.0))
	var t_next = float(_time.get(next_unit, 0.0))
	_time[_active] = t_next
	_time[next_unit] = t_active
	_active = next_unit
	emit_signal("active_unit_changed", _active)
	emit_signal("active_unit_swapped", previous, _active)
	return true

func _pick_next_candidate(units: Array[Unit], time: Dictionary) -> Unit:
	var best: Unit = null
	var best_t: float = INF
	for u in units:
		var t = float(time.get(u, 0.0))
		if t < best_t:
			best_t = t
			best = u
	return best


func _process(_delta: float) -> void:
	if _active == null:
		_pick_next_active()
		return
	if _active.dead:
		_active = null
		_pick_next_active()
		return
	if _active.pa <= 0:
		_end_active_turn()


func _end_active_turn() -> void:
	if _active == null:
		return

	emit_signal("turn_ending", _active)

	var spd = max(1, _active.speed)
	var cost = tick_per_turn / float(spd)
	_time[_active] = float(_time.get(_active, 0.0)) + cost

	_active.pa = _active.pa_max

	_active = null
	_pick_next_active()

func force_end_active_turn() -> void:
	if _active == null:
		return
	_active.pa = 0
	_end_active_turn()


func _pick_next_active() -> void:
	_units = _units.filter(func(u): return u != null and not u.dead)
	if _units.is_empty():
		_active = null
		return

	var best: Unit = null
	var best_t: float = INF

	for u in _units:
		var t = float(_time.get(u, 0.0))
		if t < best_t:
			best_t = t
			best = u

	_active = best
	if _active != null:
		activation_count += 1
		_active.tick_cooldowns()
		emit_signal("active_unit_changed", _active)
		
func force_end_turn() -> void:
	if _active == null:
		return
	_end_active_turn()
