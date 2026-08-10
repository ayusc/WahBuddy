FROM node:20

RUN apt-get update && apt-get install -y \
    python3 \
    python-is-python3 \
    
WORKDIR /wahbuddy

COPY package.json ./

RUN npm install --omit=dev --legacy-peer-deps

COPY . .

# uncomment this line if not using web process
EXPOSE 8000

CMD ["node", "main.js"]
