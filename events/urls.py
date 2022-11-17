from django.urls import path, re_path
from . import views

urlpatterns = [
    path('', views.eventsets, name='eventsets'),
    re_path(r'^set/(?P<set_id>.+)/event/(?P<event_id>\d+)/$', views.event, name='event'),
    re_path(r'^set/(?P<set_id>.+)/event/(?P<event_id>\d+)/evd-2d/$', views.evd_2D, name='evd_2D'),
    re_path(r'^set/(?P<set_id>.+)/event/(?P<event_id>\d+)/(?P<name>[\w\-]+)/$', views.data, name='data'),
    re_path(r'^set/(?P<set_id>.+)/event/list/$', views.event_list, name='event_list'),
    re_path(r'^collection/(?P<collection_id>.+)/$', views.collection, name='collection'),

    path('upload/', views.upload, name='upload'),

    path('wires/', views.wires, name='wires'),
]
