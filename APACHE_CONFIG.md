# Apache Reverse Proxy Configuration for Rate Limiting

When using Apache as a reverse proxy in front of your Node.js application, you need to configure it properly to ensure rate limiting works correctly.

## Required Apache Configuration

Add the following to your Apache virtual host configuration or `.htaccess` file:

```apache
<VirtualHost *:80>
    ServerName api.freshlancer.online
    
    # Forward real client IP to Node.js application
    ProxyPreserveHost On
    ProxyPass / http://localhost:8080/
    ProxyPassReverse / http://localhost:8080/
    
    # Pass real IP address to backend
    RequestHeader set X-Forwarded-For %{REMOTE_ADDR}e
    RequestHeader set X-Real-IP %{REMOTE_ADDR}e
    RequestHeader set X-Forwarded-Proto %{REQUEST_SCHEME}e
    
    # Enable proxy module
    ProxyRequests Off
    ProxyVia On
</VirtualHost>
```

## For HTTPS (Port 443)

```apache
<VirtualHost *:443>
    ServerName api.freshlancer.online
    
    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /path/to/your/certificate.crt
    SSLCertificateKeyFile /path/to/your/private.key
    SSLCertificateChainFile /path/to/your/chain.crt
    
    # Forward real client IP to Node.js application
    ProxyPreserveHost On
    ProxyPass / http://localhost:8080/
    ProxyPassReverse / http://localhost:8080/
    
    # Pass real IP address to backend
    RequestHeader set X-Forwarded-For %{REMOTE_ADDR}e
    RequestHeader set X-Real-IP %{REMOTE_ADDR}e
    RequestHeader set X-Forwarded-Proto https
    
    # Enable proxy module
    ProxyRequests Off
    ProxyVia On
</VirtualHost>
```

## Enable Required Apache Modules

Make sure these modules are enabled:

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod headers
sudo systemctl restart apache2
```

## Why This Matters

Without proper IP forwarding:
- All requests appear to come from Apache's IP (usually 127.0.0.1)
- Rate limiting applies to all users collectively instead of per-user
- Legitimate users get blocked when one user exceeds limits

With proper configuration:
- Each user's real IP is forwarded to Node.js
- Rate limiting works per-user correctly
- Better security and user experience

## Testing

After configuration, test that the real IP is being forwarded:

```bash
# In your Node.js app, log req.headers
console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
console.log('X-Real-IP:', req.headers['x-real-ip']);
console.log('req.ip:', req.ip);
```

You should see the client's real IP address, not 127.0.0.1.

