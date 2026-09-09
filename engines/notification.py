def send_sms_alert(message: str):
    """
    Mocks sending an SMS via an SMS Gateway.
    """
    print("\n" + "="*40)
    print(" SMS GATEWAY NOTIFICATION ")
    print(f"To: Technician On-Call")
    print(f"Message: {message}")
    print("="*40 + "\n")
