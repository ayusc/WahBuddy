FROM node:20

RUN apk add --no-cache python3

WORKDIR /wahbuddy

COPY package.json ./

RUN npm install --omit=dev --legacy-peer-deps

COPY . .

# uncomment this line if not using web process
EXPOSE 8000

CMD ["node", "main.js"]
