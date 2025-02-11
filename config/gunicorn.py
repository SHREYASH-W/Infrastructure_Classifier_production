# gunicorn.conf.py
workers = 1
worker_class = 'sync'  
timeout = 120
max_requests = 1000
max_requests_jitter = 50