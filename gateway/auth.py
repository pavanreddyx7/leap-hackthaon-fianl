def authenticate_device(device_id, token):
    allowed_devices = {
        "P001": "token123",
        "H001": "token456"
    }

    if device_id in allowed_devices and allowed_devices[device_id] == token:
        return True
    return False
