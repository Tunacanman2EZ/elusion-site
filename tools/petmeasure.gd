# tools/petmeasure.gd - how much each pet puts into a boss, and how often.
#
# NOT PART OF THE WEBSITE. Run inside the game project, headless:
#   godot --headless --path <game> --fixed-fps 80 --script <this file> -- seconds=120
# Its output goes through tools/bosssim_data.mjs into bosssim-data.js.
# BOSSSIM.md has the whole procedure.
#
# Each of the seven pets is summoned beside a stand-in owner whose damage
# multiplier is 1 and whose attack speed multiplier steps through 1.0 to 2.0
# (agility 1 to 101), against the Fire Crowned held still 28 px away (the owner
# in its reach) and 90 px away (at range), with its
# health topped up every frame. Every point of health it loses is recorded by
# size, so the pet's own shot (int(damage x 1 x 0.5)) and anything else it
# leaves behind (puddles) are told apart. One PETMEASURE JSON line per run.
extends SceneTree

const PETS := ["petboss", "petelectricsprite", "petfiresprite", "petmage",
	"petpoisonslimelarge", "petpoisonslimesmall", "petsniper"]
const HASTES := [1.0, 1.25, 1.5, 1.75, 2.0]
# How far the owner stands from the boss: in its reach, and at range.
const DISTANCES := [["melee", 28.0], ["range", 90.0]]
const TICKS := 80


class Owner extends Node2D:
	var haste: float = 1.0
	func get_damage_multiplier() -> float:
		return 1.0
	func get_attack_speed_multiplier() -> float:
		return haste


class Pin extends Node:
	var boss: Node2D
	var at: Vector2
	var full: int = 0
	var losses: Array = []
	func _physics_process(_delta: float) -> void:
		if not is_instance_valid(boss):
			return
		boss.global_position = at
		if "velocity" in boss:
			boss.velocity = Vector2.ZERO
		var now: int = int(boss.get("hp"))
		if now < full:
			losses.append(full - now)
			boss.set("hp", full)


var seconds: float = 120.0


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("seconds="):
			seconds = float(arg.trim_prefix("seconds="))
	_run.call_deferred()


func _run() -> void:
	await process_frame
	for pet_id in PETS:
		for spot in DISTANCES:
			for haste in HASTES:
				var row: Dictionary = await _measure(pet_id, haste, spot[0], float(spot[1]))
				print("PETMEASURE ", JSON.stringify(row))
	quit(0)


func _measure(pet_id: String, haste: float, stance: String, distance: float) -> Dictionary:
	var world := Node2D.new()
	root.add_child(world)
	# Floating numbers and anything else parented to "the scene" need one.
	current_scene = world
	for group in ["groundeffects", "projectiles"]:
		var holder := Node2D.new()
		holder.add_to_group(group)
		world.add_child(holder)

	var owner := Owner.new()
	owner.haste = haste
	world.add_child(owner)
	owner.global_position = Vector2.ZERO

	var boss: Node2D = (load("res://scene/enemy/fireboss.tscn") as PackedScene).instantiate()
	boss.position = Vector2(distance, 0)
	world.add_child(boss)
	var pin := Pin.new()
	pin.boss = boss
	pin.at = Vector2(distance, 0)
	pin.process_physics_priority = 1000
	world.add_child(pin)

	var pet: Node2D = (load("res://scene/pets/%s.tscn" % pet_id) as PackedScene).instantiate()
	pet.set("owner_player", owner)
	pet.position = Vector2(-30, 0)
	world.add_child(pet)

	await physics_frame
	await physics_frame
	pin.full = int(boss.get("max_hp"))
	boss.set("hp", pin.full)
	var base: int = int(pet.get("projectile_damage"))
	# Settle: summoned, turned and first wind-up begun.
	for i in range(TICKS * 2):
		await physics_frame
	pin.losses.clear()
	for i in range(int(seconds * TICKS)):
		await physics_frame

	var by_amount: Dictionary = {}
	for a in pin.losses:
		by_amount[str(a)] = int(by_amount.get(str(a), 0)) + 1
	var row := {"pet": pet_id, "haste": haste, "stance": stance, "distance": distance, "seconds": seconds, "damage": base,
		"shot": int(base * 1.0 * 0.5), "cooldown": pet.get("attack_cooldown"),
		"losses": by_amount, "total": pin.losses.reduce(func(a, b): return a + b, 0)}
	world.queue_free()
	await process_frame
	await process_frame
	return row
