from django.shortcuts import render, HttpResponse
from django.core import serializers

# Create your views here.
from .models import PDGParticles
# from django.conf import settings
import json


def particle_list(request):
    particles = PDGParticles().particles()

    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return HttpResponse(serializers.serialize("json", particles))
    else:
        return render(request, 'particles/list.html', {
            'particles': particles,
        })