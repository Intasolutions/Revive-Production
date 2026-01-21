import sys

class RequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if '/auth/token/' in request.path:
            msg = f"\n!!! INCOMING LOGIN REQUEST !!!\nPath: {request.path}\nMethod: {request.method}\n"
            try:
                msg += f"Body: {request.body.decode('utf-8')}\n"
            except:
                msg += f"Body (Binary): {request.body}\n"
            msg += "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n"
            
            # FORCE PRINT TO CONSOLE
            sys.stdout.write(msg)
            sys.stdout.flush()
            sys.stderr.write(msg)
            sys.stderr.flush()
        
        return self.get_response(request)
