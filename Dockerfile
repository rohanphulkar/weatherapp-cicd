FROM node:22-alpine

WORKDIR /weatherapp

COPY package*.json .
RUN npm ci

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
