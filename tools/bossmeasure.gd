# tools/bossmeasure.gd - what each boss does to a player who never moves.
#
# NOT PART OF THE WEBSITE. It reads the game, so it runs inside the game
# project, headless, as fast as the machine allows (--fixed-fps turns off
# real-time pacing):
#   godot --headless --path <game> --fixed-fps 80 --script <this file> -- seconds=300
# Its output goes through tools/bosssim_data.mjs into bosssim-data.js.
# BOSSSIM.md has the whole procedure.
#
# For each of the seven bosses, each phase (health held at 83%, 50% and 17%)
# and each stance (the stand-in 28 px from the boss, inside its 40 px swing;
# and 90 px away, inside its 120 px attack range but out of reach), the boss
# fights a stand-in player that never moves, with the boss held where it
# stands. Everything that lands is recorded by its size - the swing, a spike
# (both tracks hit for the boss's spike), a stalker's pillar, a puddle tick -
# together with what the boss put on the floor. One JSON line per run,
# prefixed BOSSMEASURE.
extends SceneTree

const BOSSES := [
	["light", "res://scene/enemy/lightboss.tscn"],
	["wind", "res://scene/enemy/windboss.tscn"],
	["water", "res://scene/enemy/waterboss.tscn"],
	["ice", "res://scene/enemy/iceboss.tscn"],
	["earth", "res://scene/enemy/earthboss.tscn"],
	["fire", "res://scene/enemy/fireboss.tscn"],
	["crowned", "res://scene/enemy/bossenemy.tscn"],
]
const PHASE_HEALTH := [0.83, 0.50, 0.17]
const STANCES := [["melee", 28.0], ["range", 90.0]]
const TICKS := 80


class StandIn extends CharacterBody2D:
	var hits: Array = []
	func take_damage(amount: int, element: int = 0) -> void:
		hits.append([int(amount), int(element)])


class Pin extends Node:
	# Runs after the boss each physics frame and puts it back: the boss attacks
	# as it would, but never walks onto the stand-in or away from its hazards.
	var boss: Node2D
	var at: Vector2
	func _physics_process(_delta: float) -> void:
		if is_instance_valid(boss):
			boss.global_position = at
			if "velocity" in boss:
				boss.velocity = Vector2.ZERO


var seconds: float = 120.0


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("seconds="):
			seconds = float(arg.trim_prefix("seconds="))
	_run.call_deferred()


func _run() -> void:
	await process_frame
	for spec in BOSSES:
		for stance in STANCES:
			for phase in range(3):
				var row: Dictionary = await _measure(spec[0], spec[1], stance[0], float(stance[1]), phase)
				print("BOSSMEASURE ", JSON.stringify(row))
	quit(0)


func _measure(id: String, path: String, stance: String, distance: float, phase: int) -> Dictionary:
	var world := Node2D.new()
	world.name = "measureworld"
	root.add_child(world)
	# Floating numbers and anything else parented to "the scene" need one.
	current_scene = world
	var effects := Node2D.new()
	effects.add_to_group(&"groundeffects")
	world.add_child(effects)

	var stand := StandIn.new()
	stand.add_to_group(&"player")
	stand.collision_layer = 4
	stand.collision_mask = 0
	var shape := CollisionShape2D.new()
	shape.name = "bodyshape"
	var circle := CircleShape2D.new()
	circle.radius = 8.0
	shape.shape = circle
	stand.add_child(shape)
	world.add_child(stand)
	stand.global_position = Vector2(distance, 0.0)

	var boss: Node2D = (load(path) as PackedScene).instantiate()
	boss.position = Vector2.ZERO
	world.add_child(boss)
	var pin := Pin.new()
	pin.boss = boss
	pin.at = Vector2.ZERO
	pin.process_physics_priority = 1000
	world.add_child(pin)

	var spawned: Dictionary = {}
	var puddles: Dictionary = {}
	effects.child_entered_tree.connect(func(n: Node) -> void:
		var key: String = n.scene_file_path.get_file().get_basename() if n.scene_file_path != "" else \
			(str(n.get_script().resource_path.get_file().get_basename()) if n.get_script() != null else n.get_class())
		spawned[key] = int(spawned.get(key, 0)) + 1
		if key.ends_with("puddle") and not puddles.has(key):
			puddles[key] = {"tick": n.get("tick_damage"), "lifetime": n.get("lifetime"),
				"interval": n.get("tick_interval")})

	await physics_frame
	await physics_frame
	var max_hp: int = int(boss.get("max_hp"))
	boss.set("hp", int(round(max_hp * PHASE_HEALTH[phase])))
	var melee: int = int(boss.call("melee_damage"))
	var trail: int = int(boss.call("trail_damage"))
	var spike_raw: int = int(boss.call("spike_damage"))

	stand.hits.clear()
	for i in range(int(seconds * TICKS)):
		await physics_frame
		# Held in its phase: nothing the stand-in does hurts it, but be sure.
		if int(boss.get("hp")) != int(round(max_hp * PHASE_HEALTH[phase])):
			boss.set("hp", int(round(max_hp * PHASE_HEALTH[phase])))

	var by_amount: Dictionary = {}
	for h in stand.hits:
		by_amount[str(h[0])] = int(by_amount.get(str(h[0]), 0)) + 1
	var element: int = int(boss.call("current_element"))

	# The element profile scales the spike and the trail (bossprojectile.gd),
	# so a stalker's pillar lands at the profiled size, not trail_damage().
	var profile: Dictionary = (load("res://src/projectiles/bossprojectile.gd") as GDScript) \
		.get_script_constant_map()["ELEMENT_PROFILE"]
	var factor: float = float((profile.get(element, profile[0]) as Dictionary)["damage"])
	var row := {"boss": id, "stance": stance, "phase": phase, "seconds": seconds,
		"max_hp": max_hp, "element": element, "spike_raw": spike_raw, "melee": melee,
		"trail": maxi(1, int(round(trail * factor))), "spike": maxi(1, int(round(spike_raw * factor))),
		"factor": factor,
		"hits": by_amount, "spawned": spawned, "puddles": puddles,
		"total": stand.hits.reduce(func(a, h): return a + int(h[0]), 0)}
	world.queue_free()
	await process_frame
	await process_frame
	return row

