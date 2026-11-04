"""Compatibility marker: GIS reference data is imported and maintained externally.

Replaces the historical one-off data operation without modifying GIS tables.
The replacement covers one migration so partially upgraded databases also work.
"""
from django.db import migrations


class Migration(migrations.Migration):
    replaces = [('mygis', '0005_validate_aligned_borders')]
    dependencies = [('mygis', '0004_country_borders_external')]
    operations = []
