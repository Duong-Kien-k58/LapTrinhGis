from django.urls import path
from . import views
from . import raster

urlpatterns = [
    path('health/', views.health),
    path('rasters/csrf/', raster.csrf_token),
    path('rasters/', raster.list_rasters),
    path('rasters/upload/', raster.save_raster),
    path('rasters/<str:raster_name>/upload/', raster.save_raster),
    path('rasters/<str:raster_name>/metadata/', raster.update_raster_metadata),
    path('rasters/<str:raster_name>/sync/', raster.sync_raster_from_geoserver),
    path('rasters/<str:raster_name>/delete/', raster.delete_raster),
    path('features/<str:layer_name>/add/', views.add_feature, name='add_feature'),
    path('features/<str:layer_name>/<int:feature_id>/edit/', views.edit_feature, name='edit_feature'),
    path('features/<str:layer_name>/<int:feature_id>/delete/', views.delete_feature, name='delete_feature'),
]
