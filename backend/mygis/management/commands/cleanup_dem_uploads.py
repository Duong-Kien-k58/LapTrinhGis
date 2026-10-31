from django.conf import settings
from django.core.management.base import BaseCommand

from mygis.terrain_analysis import cleanup_expired, cleanup_jobs


class Command(BaseCommand):
    help = 'Xóa các DEM tạm đã hết hạn; không xóa tác vụ đang kiểm tra.'

    def handle(self, *args, **options):
        cleanup_expired(settings.DEM_UPLOAD_ROOT)
        cleanup_jobs()
        self.stdout.write(self.style.SUCCESS('Expired temporary DEM uploads and slope results cleaned.'))
