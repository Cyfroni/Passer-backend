docker stop Passer
docker rm Passer
docker build -t passer .
docker run --name Passer -di passer