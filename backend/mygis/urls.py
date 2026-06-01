from django.urls import path
from . import views

urlpatterns = [
    path('features/<str:layer_name>/add/', views.add_feature, name='add_feature'),
    path('features/<str:layer_name>/<int:feature_id>/edit/', views.edit_feature, name='edit_feature'),
    path('features/<str:layer_name>/<int:feature_id>/delete/', views.delete_feature, name='delete_feature'),
]