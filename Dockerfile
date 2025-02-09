FROM docker.n8n.io/n8nio/n8n

# You can add any additional configuration here if needed
# For example, environment variables:
ENV N8N_PORT=5678
ENV NODE_ENV=production

# Expose the port n8n runs on
EXPOSE 5678

# The image already has the proper CMD/ENTRYPOINT set up