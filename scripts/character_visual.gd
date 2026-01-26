extends Node3D
class_name CharacterVisual

@onready var _animation_player: AnimationPlayer = get_node_or_null("AnimationPlayer")

func play_idle() -> void:
	_play("idle")

func play_run() -> void:
	_play("run")

func play_attack() -> void:
	_play("attack")

func play_cast() -> void:
	_play("cast")

func play_crouch() -> void:
	_play("crouch")

func _play(anim_name: String) -> void:
	if _animation_player != null and _animation_player.has_animation(anim_name):
		_animation_player.play(anim_name)
		return
	print("CharacterVisual: animação '%s' não disponível" % anim_name)
