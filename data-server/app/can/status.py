# app/can/status.py
import os
import subprocess

def iface_state(name: str):
    path = f"/sys/class/net/{name}/operstate"

    if not os.path.exists(path):
        return {"name": name, "exists": False, "up": False, "state": "missing"}

    state = open(path).read().strip()
    return {
        "name": name,
        "exists": True,
        "up": state == "up",
        "state": state,
    }

def get_can_status():
    can0 = iface_state("can0")
    can1 = iface_state("can1")
    can2 = iface_state("can2")
    vcan0 = iface_state("vcan0")

    if can0["up"]:
        active = "can0"
        mode = "live"
    elif can1["up"]:
        active = "can1"
        mode = "live"
    elif can2["up"]:
        active = "can2"
        mode = "live"
    elif vcan0["up"]:
        active = "vcan0"
        mode = "simulation"
    else:
        active = None
        mode = "offline"

    return {
        "active": active,
        "mode": mode,
        "can0": can0,
        "can1": can1,
        "can2": can2,
        "vcan0": vcan0,
    }