from django.shortcuts import render, HttpResponse
from django.core import serializers

# Create your views here.
from .models import EventSet
from django.conf import settings
import os, json


def eventsets(request):
    eventset_list = EventSet.objects.all().order_by('-created_at')

    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return HttpResponse(serializers.serialize("json", eventset_list))
    else:
        return render(request, 'events/eventsets.html', {
            'eventset_list': eventset_list,
        })


def get_eventset(set_id):
    if (set_id.isdigit()):
        set_id = int(set_id)
        eventset = EventSet.objects.get(pk=set_id)
    else:
        eventset = EventSet()
        eventset.alias = set_id
    return eventset

def collection(request, collection_id):
    context = {
        'collection_id': collection_id,
        'sets': []
    }

    try:
        collection_root = "%s/%s" % (settings.MEDIA_ROOT, collection_id)
        subdirs = sorted(os.listdir(collection_root))
        for subdir in subdirs:
            sets = os.listdir(collection_root+'/'+subdir)
            nEvents = 'unknown'
            if 'data' in sets:
                summary_file = collection_root+'/'+subdir + '/data/summary.json'
                if os.path.exists(summary_file):
                    # print summary_file, 'found'
                    with open(summary_file) as json_file:
                        info = json.load(json_file)
                        nEvents = len(info.keys())
                context['sets'].append({
                    'name': subdir,
                    'nEvents' : nEvents,
                    'url' : 'set/'+collection_id+'/'+subdir+'/event/list/'
                })
            else:
                context['sets'].append({
                    'name': subdir,
                    'nEvents' : '[folder]',
                    'url' : 'collection/'+collection_id+'/'+subdir+'/'
                })
    except OSError:
        return HttpResponse('Collection ' + collection_id + ' does not exist.')

    # print context
    return render(request, 'events/collection.html', context)

def event_list(request, set_id):
    try:
        eventset = get_eventset(set_id)
    except ObjectDoesNotExist:
        return HttpResponse('Event set for ' + set_id + ' does not exist.')

    context = {
        'set_id': set_id,
        'event_list': [],
    }

    summary = eventset.summary()
    if summary:
        sorted_keys = sorted(summary.keys(), key=int)
        for key in sorted_keys:
            context['event_list'].append(summary[key])
            context['event_list'][-1]['id'] = key

    # from pprint import pprint
    # pprint(context)

    return render(request, 'events/event_list.html', context)

def event(request, set_id, event_id):

    try:
        eventset = get_eventset(set_id)
    except ObjectDoesNotExist:
        return HttpResponse('Event set for ' + set_id + ' does not exist.')

    context = {
        'eventset': eventset,
        'set_id': set_id,
        'event_id': event_id,
    }

    def queryToOptions(request):
        '''only works for two nested levels'''
        options = {}
        q = request.GET
        for key, value in q.items():
            try:
                value_clean = float(value)
            except ValueError:
                value_clean = value
            if value_clean == 'true':
                value_clean = True
            elif value_clean == 'false':
                value_clean = False

            if key.find('.') > 0:
                key1, key2 = key.split('.')
                options.setdefault(key1, {})
                options[key1][key2] = value_clean
            else:
                options[key] = value_clean
        return options

    def update(d, u):
        for k, v in u.iteritems():
            if isinstance(v, collections.Mapping):
                d[k] = update(d.get(k, {}), v)
            else:
                d[k] = v
        return d

    sst_list = eventset.recon_list(int(event_id))
    if (len(sst_list)==0):
        return HttpResponse("Sorry, no data found.")

    options = {
        'nEvents' : eventset.event_count(),
        'id' : int(event_id),
        'experiment': eventset.geom(event_id),
        'hasMC' : eventset.has_MC(int(event_id)),
        'hasOP' : eventset.has_OP(int(event_id)),
        'hasDeadArea' : eventset.has_DeadArea(int(event_id)),
        'sst': sst_list,
        'config': {},
    }
    # elif (eventset.geom(event_id) == 'dl'):
    #     options['camera'] = {
    #         'depth': 200,
    #     }
    #     options['geom']['name'] = 'dl'
    #     options['geom']['angleU'] = 60
    #     options['geom']['angleV'] = 60    
    #     options['geom']['bounding_box'] = eventset.bounding_box(event_id)

    options['config'] = queryToOptions(request)

    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return HttpResponse(json.dumps(options))
    else:
        return render(request, 'events/event.html', context)

def data(request, set_id, event_id, name):
    '''only for ajax'''
    eventset = get_eventset(set_id)
    filename = os.path.join(eventset.data_dir(), event_id, event_id)
    if (name == 'mc'):
        filename += "-mc.json"
    elif (name == 'op'):
        filename += "-op.json"
    elif (name == 'WireCell-charge'):
        filename += "-rec_charge_blob.json"
    elif (name == 'WireCell-simple'):
        filename += "-rec_simple.json"
    elif (name == 'WireCell-deblob'):
        filename += "-rec_charge_cell.json"
    elif (name == 'truth'):
        filename += "-truth.json"
    else:
        filename += "-" + name + ".json"

    try:
        data = open(filename).read()
        return HttpResponse(data)
    except IOError:
        return HttpResponse(filename + ' does not exist')


def evd_2D(request, set_id, event_id):
    # print
    d = "%smedia/%s/plots/%s/" % (settings.STATIC_URL, set_id, event_id)

    context = {
        'base_plots_url': d,
    }
    return render(request, 'events/evd_2D.html', context)


def upload(request):
    '''file upload'''
    import uuid, subprocess
    if request.method == 'POST':
        new_file = request.FILES['file']
        # print new_file.name, new_file.size, new_file.content_type
        unique_name = str(uuid.uuid4())
        new_filename = os.path.join(settings.MEDIA_ROOT, unique_name+'.zip')
        # print new_filename
        with open(new_filename, 'wb+') as destination:
            for chunk in new_file.chunks():
                destination.write(chunk)

        cmd = 'unzip -l ' + new_filename + ' | head -n 5 | tail -n 2 | awk \'{print $4}\''
        # print cmd
        try:
            output = subprocess.check_output(cmd, shell=True).decode()
            if (output.startswith('data/\ndata/')):
                print('Good Format!')
            else:
                print('Bad Format!', output)
                return HttpResponse('DataNotValid')
        except subprocess.CalledProcessError:
            return HttpResponse('DataNotValid')

        extract_dir = os.path.join(settings.MEDIA_ROOT, unique_name)
        cmd = 'unzip %s -d %s && chmod -R g+w %s' % (
            new_filename, extract_dir, extract_dir)
        subprocess.call(cmd, shell=True)
        return HttpResponse(unique_name)
    else:
        return HttpResponse('No Get, Please POST')

def wires(request):
    filename = settings.MEDIA_ROOT / 'WireGeometry' / 'protodunevd.json'
    data = open(filename).read()
    # print(request.headers)
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return HttpResponse(data)
    else:
        data = json.loads(data)
        return render(request, 'events/wires.html', {
            'experiment': 'protodune-vd',
            'anodes': data['Store']['anodes'],
            'faces': [0],
            'planes': [0, 1, 2],
        }) 
