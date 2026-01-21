"""
ASGI config for revive_cms project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application
import socketio
from .sio import sio

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'revive_cms.settings')

django_asgi_app = get_asgi_application()

# Wrap Django ASGI application with Socket.IO
application = socketio.ASGIApp(sio, django_asgi_app)
