def compute_effective_home_status(home_own_status, pole_status):
    """A home's displayed status must reflect that it has no power if its
    own sensor reads zero volts, OR if the pole feeding it has zero volts —
    without ever touching the pole's own status or a sibling home's status.
    """
    if home_own_status == "NO DATA":
        return "NO DATA"
    if pole_status == "OFF" or home_own_status == "OFF":
        return "OFF"
    return "ON"
