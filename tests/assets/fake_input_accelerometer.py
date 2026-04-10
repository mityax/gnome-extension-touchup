#!/usr/bin/env python3

import os
import sys
import time
import tty
import termios
import select
import fcntl
import ctypes
import ctypes.util

ONEG = 256

EV_SYN = 0x00
EV_ABS = 0x03

SYN_REPORT = 0

ABS_X = 0x00
ABS_Y = 0x01
ABS_Z = 0x02

BUS_VIRTUAL = 0x06

UI_SET_EVBIT = 0x40045564
UI_SET_ABSBIT = 0x40045567
UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502

UINPUT_PATH = "/dev/uinput"


class TimeVal(ctypes.Structure):
    _fields_ = [
        ("tv_sec", ctypes.c_long),
        ("tv_usec", ctypes.c_long),
    ]


class InputID(ctypes.Structure):
    _fields_ = [
        ("bustype", ctypes.c_ushort),
        ("vendor", ctypes.c_ushort),
        ("product", ctypes.c_ushort),
        ("version", ctypes.c_ushort),
    ]


class InputEvent(ctypes.Structure):
    _fields_ = [
        ("time", TimeVal),
        ("type", ctypes.c_ushort),
        ("code", ctypes.c_ushort),
        ("value", ctypes.c_int),
    ]


class UInputUserDev(ctypes.Structure):
    _fields_ = [
        ("name", ctypes.c_char * 80),
        ("id", InputID),
        ("ff_effects_max", ctypes.c_uint),
        ("absmax", ctypes.c_int * 64),
        ("absmin", ctypes.c_int * 64),
        ("absfuzz", ctypes.c_int * 64),
        ("absflat", ctypes.c_int * 64),
    ]


libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
libc.gettimeofday.argtypes = [ctypes.POINTER(TimeVal), ctypes.c_void_p]
libc.gettimeofday.restype = ctypes.c_int


def get_timeval():
    tv = TimeVal()
    if libc.gettimeofday(ctypes.byref(tv), None) != 0:
        err = ctypes.get_errno()
        raise OSError(err, os.strerror(err))
    return tv


class OrientationData:
    def __init__(self):
        self.uinput_fd = None
        self.accel_x = 0
        self.accel_y = ONEG
        self.accel_z = 0
        self.old_tio = None
        self.uinput_sysfs_path = None


def write_sysfs_string(filename, basedir, val):
    path = os.path.join(basedir, filename)
    with open(path, "w") as f:
        f.write(val)


def find_uinput_sysfs_device(device_name):
    base = "/sys/devices/virtual/input"
    if not os.path.isdir(base):
        return None

    for entry in os.listdir(base):
        if not entry.startswith("input"):
            continue
        candidate = os.path.join(base, entry)
        name_file = os.path.join(candidate, "name")
        try:
            with open(name_file, "r") as f:
                name = f.read().strip()
            if name == device_name:
                return candidate
        except (FileNotFoundError, OSError):
            pass

    return None


def trigger_uevent(sysfs_path):
    if not sysfs_path:
        return False
    try:
        write_sysfs_string("uevent", sysfs_path, "change")
        return True
    except Exception:
        return False


def setup_uinput(data):
    fd = os.open(UINPUT_PATH, os.O_WRONLY | os.O_NONBLOCK)

    fcntl.ioctl(fd, UI_SET_EVBIT, EV_ABS)
    fcntl.ioctl(fd, UI_SET_ABSBIT, ABS_X)
    fcntl.ioctl(fd, UI_SET_ABSBIT, ABS_Y)
    fcntl.ioctl(fd, UI_SET_ABSBIT, ABS_Z)

    dev = UInputUserDev()
    dev.name = b"iio-sensor-proxy test application"
    dev.id.bustype = BUS_VIRTUAL
    dev.id.vendor = 0x00
    dev.id.product = 0x00
    dev.id.version = 0x01

    dev.absmin[ABS_X] = -512
    dev.absmin[ABS_Y] = -512
    dev.absmin[ABS_Z] = -512

    dev.absmax[ABS_X] = 512
    dev.absmax[ABS_Y] = 512
    dev.absmax[ABS_Z] = 512

    os.write(fd, bytes(dev))
    fcntl.ioctl(fd, UI_DEV_CREATE)

    time.sleep(0.2)

    data.uinput_fd = fd
    data.uinput_sysfs_path = find_uinput_sysfs_device(
        "iio-sensor-proxy test application"
    )


def send_event(fd, ev_type, code, value):
    ev = InputEvent()
    ev.time = get_timeval()
    ev.type = ev_type
    ev.code = code
    ev.value = value
    os.write(fd, bytes(ev))


def send_uinput_event(data):
    send_event(data.uinput_fd, EV_ABS, ABS_X, data.accel_x)
    send_event(data.uinput_fd, EV_ABS, ABS_Y, data.accel_y)
    send_event(data.uinput_fd, EV_ABS, ABS_Z, data.accel_z)
    send_event(data.uinput_fd, EV_SYN, SYN_REPORT, 0)

    trigger_uevent(data.uinput_sysfs_path)


def keyboard_usage():
    print("Valid keys are: u (up), d (down), l (left), r (right), q/x (quit)")


def setup_keyboard(data):
    fd = sys.stdin.fileno()
    data.old_tio = termios.tcgetattr(fd)
    tty.setcbreak(fd)
    os.set_blocking(fd, False)


def restore_keyboard(data):
    if data.old_tio is not None:
        termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, data.old_tio)


def check_keyboard(data):
    fd = sys.stdin.fileno()

    rlist, _, _ = select.select([fd], [], [], 0.1)
    if not rlist:
        return True

    try:
        raw = os.read(fd, 1)
    except BlockingIOError:
        return True

    if not raw:
        return True

    ch = raw.decode(errors="ignore")

    # Debug line: shows the key was actually received
    print(f"Pressed: {repr(ch)}")

    if ch == "u":
        data.accel_x = 0
        data.accel_y = -ONEG
        data.accel_z = 0
    elif ch == "d":
        data.accel_x = 0
        data.accel_y = ONEG
        data.accel_z = 0
    elif ch == "l":
        data.accel_x = ONEG
        data.accel_y = 0
        data.accel_z = 0
    elif ch == "r":
        data.accel_x = -ONEG
        data.accel_y = 0
        data.accel_z = 0
    elif ch in ("q", "x"):
        return False
    else:
        keyboard_usage()
        return True

    send_uinput_event(data)
    return True


def cleanup(data):
    restore_keyboard(data)

    if data.uinput_fd is not None:
        try:
            fcntl.ioctl(data.uinput_fd, UI_DEV_DESTROY)
        except OSError:
            pass
        try:
            os.close(data.uinput_fd)
        except OSError:
            pass
        data.uinput_fd = None


def main():
    data = OrientationData()

    try:
        setup_keyboard(data)
        setup_uinput(data)

        # Start in "normal" orientation, but DO NOT emit on startup
        data.accel_x = 0
        data.accel_y = ONEG
        data.accel_z = 0

        keyboard_usage()

        while True:
            if not check_keyboard(data):
                break

    finally:
        cleanup(data)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
