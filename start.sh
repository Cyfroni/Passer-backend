docker stop Passer
docker rm Passer
docker build -t passer . 
docker run -p 8080:8080 --name Passer -di passer