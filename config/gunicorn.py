# gunicorn.conf.py
workers = 1
worker_class = 'gevent'
timeout = 120
max_requests = 1000
max_requests_jitter = 50