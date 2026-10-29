"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os
import sys
from pathlib import Path

sys.pycache_prefix = str(Path(__file__).resolve().parents[2] / 'temp' / 'python-cache')
os.environ['PYTHONPYCACHEPREFIX'] = sys.pycache_prefix

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

application = get_asgi_application()
