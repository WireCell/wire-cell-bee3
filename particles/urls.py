from django.urls import path, re_path
from . import views

urlpatterns = [
    path('', views.particle_list, name='particle_list'),

]