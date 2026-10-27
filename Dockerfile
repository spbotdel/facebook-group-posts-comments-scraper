FROM apify/actor-node:20

COPY package*.json ./
RUN npm --quiet set progress=false \
 && npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY . ./

CMD ["npm", "start", "--silent"]
