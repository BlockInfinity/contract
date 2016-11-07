
demand <- data.frame("quantity"=c(67,200,10),"max.price"=c(NA, 10,30))
supply <- data.frame("quantity"=c(40,1,25,50,45), "price"=c(30,24,20,30,23))

matchQuantity <- function(demand, supply)
{
  if(sum(demand[is.na(demand$max.price),]$quantity) > sum(supply$quantity))
  {su
    print("Demand higher than supply (Bundesnetzagentur müsste einspringen)")   
    return(FALSE)
  }
  for (i.price in sort(unique(supply$price)))

          if (sum(supply[supply$price<=i.price,1]) >= sum(demand[demand$max.price>=i.price | is.na(demand$max.price),1]))
      {
        print("=====================")
        print(paste("price: ", i.price, sep=""))
        print("Supply: ")
        print(supply[supply$price<=i.price,])
        print("Demand: ")
        print(demand[(demand$max.price>=i.price | is.na(demand$max.price)),])
        
        share <- sum(demand[(demand$max.price>=i.price | is.na(demand$max.price)),1])/ sum(supply[supply$price<=i.price,1])
        print("Supply-Result:")
        tmp <- supply[supply$price<=i.price,]
        result <- data.frame("quantity"=tmp[,1]* share, "price"=i.price )
        print(result)
        # It would be also possible to order them according to their price and the most expensive delivers less
        break;   
      }
    }


matchQuantity(demand, supply)


