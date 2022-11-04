from django.urls import path
from . import views

urlpatterns = [
    path('', views.particle_list, name='particle_list'),
    path('<int:pdg>/decays/', views.decay_list, name='decay_list'),
    path('<int:pdg>/', views.details, name='details'),
]