FROM php:8.2-apache

# Install SQLite and required PHP extensions
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libsqlite3-dev \
        libpq-dev \
        cron \
    && docker-php-ext-install pdo pdo_sqlite pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

# Enable Apache mod_rewrite just in case
RUN a2enmod rewrite

# Set ServerName to suppress warning
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Copy app
WORKDIR /var/www/html
COPY src/ ./src/
COPY init_db.php ./
COPY init_db_universal.php ./
COPY register_commands.php ./
COPY index.html ./
COPY data/ ./data/

# Ensure writable data directory
RUN mkdir -p /var/www/html/data && chown -R www-data:www-data /var/www/html/data

# Expose port
EXPOSE 80

# Default command just runs Apache
CMD ["apache2-foreground"]
