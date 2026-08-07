FROM node:20

WORKDIR /wahbuddy

COPY package.json ./

RUN npm install --omit=dev --legacy-peer-deps

COPY . .

# uncomment this line if not using web process
EXPOSE 8000

CMD ["node", "main.js"]
