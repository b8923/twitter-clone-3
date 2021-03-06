// NOTE: All those validations (...User.findOne({...})...) can be optimized by using try/catch statement
// NOTE: Dict.count({ some: "type" }) - for clear ints

const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLID,
  GraphQLString,
  GraphQLInt,
  GraphQLBoolean
} = require('graphql');
const { GraphQLUpload, PubSub, withFilter } = require('apollo-server');

const pubsub = new PubSub();

const mimeprocessor = require('mime-types');
const fs = require('fs');

const User = require('./models/user');
const Tweet = require('./models/tweet');
const Comment = require('./models/comment');
const Notification = require('./models/notification');
const Conversation = require('./models/conversation');

function gen() {
  let a = "",
      b = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
      c = () => Math.floor(Math.random() * b.length);
  for(let ma = 0; ma < 225; ma++) a += b[c()];

  return a;
}

let shortCon = text => (text.length > 125) ? text.substr(0, 125) + "..." : text;
let str = str1 => str1.toString();

const infiniteScrollSplit = 15;

const UserType = new GraphQLObjectType({
  name: "User",
  fields: () => ({
    id: { type: GraphQLID },
    name: { type: GraphQLString },
    url: { type: GraphQLString },
    login: { type: GraphQLString },
    password: { type: GraphQLString },
    image: { type: GraphQLString },
    profileBackground: { type: GraphQLString },
    profileDescription: { type: GraphQLString },
    location: { type: GraphQLString },
    joinedDate: { type: GraphQLString },
    isVertificated: { type: GraphQLBoolean },
    notifications: {
      type: new GraphQLList(NotificationType),
      resolve: ({ notifications }) => {
        let a = [];
        notifications.forEach((_, io, ia) => {
          a[io] = str(ia[io]);
        });
        return Notification.find({
          _id: {
            $in: a
          }
        }).sort({ time: -1 })
      }
    },
    notificationsInt: {
      type: GraphQLInt,
      resolve: ({ notifications }) => notifications.length
    },
    requesterIsSubscriber: {
      type: GraphQLBoolean,
      args: {
        id: { type: GraphQLID },
        login: { type: GraphQLString },
        password: { type: GraphQLString }
      },
      async resolve({ id }, { id: _id, login, password }) { // XXX
        let a = await User.findOne({
          _id,
          login,
          password,
          subscribedTo: {
            $in: [id]
          }
        });

        return a ? true:false;
      }
    },
    subscribedTo: {
      type: new GraphQLList(UserType),
      resolve({ subscribedTo }) {
        return User.find({
          _id: {
            $in: subscribedTo
          }
        });
      }
    },
    subscribers: {
      type: new GraphQLList(UserType),
      resolve({ id }) {
        return User.find({
          subscribedTo: {
            $in: [id]
          }
        });
      }
    },
    subscribedToInt: {
      type: GraphQLInt,
      async resolve({ subscribedTo }) {
        return subscribedTo.length;
      }
    },
    subscribersInt: {
      type: GraphQLInt,
      async resolve({ id }) {
        let a = await User.count({
          subscribedTo: {
            $in: [id]
          }
        });

        return a;
      }
    },
    tweets: {
      type: new GraphQLList(TweetType),
      resolve: ({ id }) => Tweet.find({ creatorID: id }).sort({ time: -1 })
    },
    conversations: {
      type: new GraphQLList(ConversationType),
      resolve: ({ id }) => Conversation.find({
        members: {
          $in: [id]
        }
      })
    }
  })
});

const NotificationType = new GraphQLObjectType({
  name: "Notification",
  fields: () => ({
    id: { type: GraphQLID },
    contributorID: { type: GraphQLID },
    eventType: { type: GraphQLString },
    /*
      CREATED_TWEET_EVENT // subscribers,
      SUBSCRIBED_USER_EVENT // tweet's owner,
      LIKED_TWEET_EVENT // tweet's owner,
      COMMENTED_TWEET_EVENT // comments's owner,
      LIKED_COMMENT_EVENT // comment's owner
    */
    redirectID: { type: GraphQLID },
    time: { type: GraphQLString },
    shortContent: { type: GraphQLString },
    influenced: {
      type: new GraphQLList(UserType),
      resolve: ({ influenced }) => User.find({ _id: { $in: [influenced] } })
    },
    contributor: {
      type: UserType,
      resolve: ({ contributorID: id }) => User.findById(id)
    }
  })
})

const TweetType = new GraphQLObjectType({
  name: "Tweet",
  fields: () => ({
    id: { type: GraphQLID },
    creatorID: { type: GraphQLID },
    time: { type: GraphQLString },
    content: { type: GraphQLString },
    isLiked: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(parent, args) {
        return parent.likes.find(io => str(io) === str(args.id)) ? true:false;
      }
    },
    isSubscribedToCreator: { type: GraphQLBoolean },
    likes: {
      type: new GraphQLList(UserType),
      async resolve({ id }) {
        let a = await Tweet.findById(id);
        return User.find({
          _id: {
            $in: a.likes
          }
        });
      }
    },
    likesInt: {
      type: GraphQLInt,
      async resolve({ id }) {
        let a = await Tweet.findById(id);
        if(!a) return 0;

        let b = await User.count({
          _id: {
            $in: a.likes
          }
        });
        return b;
      }
    },
    comments: {
      type: new GraphQLList(CommentType),
      resolve: ({ id }) => Comment.find({ sendedToID: id }).sort({ time: -1 })
    },
    commentsInt: {
      type: GraphQLInt,
      async resolve({ id }) {
        let a = await Comment.count({ sendedToID: id });
        return a;
      }
    },
    creator: {
      type: UserType,
      resolve: ({ creatorID }) => User.findById(creatorID)
    }
  })
});

const CommentType = new GraphQLObjectType({
  name: "Comment",
  fields: () => ({
    id: { type: GraphQLID },
    creatorID: { type: GraphQLID },
    sendedToID: { type: GraphQLID },
    content: { type: GraphQLString },
    time: { type: GraphQLString },
    isLiked: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(parent, args) {
        let user = await User.findOne({ _id: args.id, login: args.login, password: args.password });
        if(user) {
          return parent.likes.find(io => str(io) === str(user._id)) ? true:false;
        } else {
          return null;
        }
      }
    },
    likes: {
      type: new GraphQLList(UserType),
      async resolve({ id }) {
        let a = await Comment.findById(id);
        return User.find({
          _id: {
            $in: a.likes
          }
        });
      }
    },
    likesInt: {
      type: GraphQLInt,
      async resolve({ id }) {
        let a = await Comment.findById(id);
        if(!a) return 0;

        let b = await User.count({
          _id: {
            $in: a.likes
          }
        });
        return b;
      }
    },
    creator: {
      type: UserType,
      resolve: ({ creatorID }) => User.findById(creatorID)
    },
    sendedTo: {
      type: TweetType,
      resolve: ({ sendedToID }) => Tweet.findById(sendedToID)
    }
  })
});

const MessageType = new GraphQLObjectType({
  name: "Message",
  fields: () => ({
    id: { type: GraphQLID },
    creator: {
      type: UserType,
      resolve: ({ creator }) => User.findById(creator)
    },
    content: { type: GraphQLString },
    contentType: { type: GraphQLString }, // STICKER_TYPE, MESSAGE_TYPE
    time: { type: GraphQLString },
    isRequesterViewed: { type: GraphQLBoolean }
  })
});

const ConversationType = new GraphQLObjectType({
  name: "Conversation",
  fields: () => ({
    id: { type: GraphQLID },
    members: {
      type: GraphQLList(UserType),
      resolve({ members }) {
        return User.find({
          _id: {
            $in: members
          }
        });
      }
    },
    messages: {
      type: new GraphQLList(MessageType),
      args: {
        cursorID: { type: GraphQLID }
      },
      resolve({ messages }, { cursorID }) {
        function limit(arr, limit = infiniteScrollSplit) {
          return arr.slice(arr.length - limit, arr.length);
        }

        if(cursorID) {
          let a = -1;
          messages.forEach((io, index) => {
            if(str(io.id) === str(cursorID)) {
              return a = index;
            }
          });
          if(a === -1) return messages;

          let b = a - infiniteScrollSplit;
          return limit(messages.slice(((b < 0) ? 0 : b), a));

        } else {
          return limit(messages);
        }
      }
    },
    lastContent: { type: GraphQLString },
    lastContentType: { type: GraphQLString },
    lastTime: { type: GraphQLString },
    isWriting: {
      type: new GraphQLList(UserType),
      resolve({ isWriting }) { // A client can receive the only id, but I think that will be a better way.
        return User.find({
          _id: {
            $in: isWriting
          }
        });
      }
    },
    victim: {
      type: UserType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve({ members }, { id: _id, login, password }) {
        let user = await User.findOne({ _id, login, password });

        if(user) {
          let nextMember = members.find(io => str(io) !== str(_id));
          return User.findById(nextMember);
        } else {
          return null;
        }
      }
    }
  })
});

const RootQuery = new GraphQLObjectType({
  name: "RootQuery",
  fields: {
    users: {
      type: new GraphQLList(UserType),
      resolve: () => User.find({})
    },
    user: {
      type: UserType,
      args: {
        id: { type: GraphQLID },
        login: { type: GraphQLString },
        password: { type: GraphQLString },
        targetID: { type: GraphQLID },
        targetUrl: { type: GraphQLString }
      },
      async resolve(_, { id: _id, login, password, targetID, targetUrl }) {
        let a = await User.findOne({ _id, login, password }); // requester

        if(targetUrl) {
          b = await User.findOne({ url: targetUrl }); // result
          if(!b) b = await User.findById(targetUrl); // try to use url as id
        } else if(targetID || _id) {
          b = await User.findById(targetID || _id); // result
        } else {
          return null;
        }
        // let b = await User[targetUrl ? "findOne" : "findById"](targetUrl ? { url: targetUrl } : (targetID || _id));

        return (a && b) ? b : null;
      }
    },
    login: {
      type: UserType,
      args: {
        login: { type: GraphQLString },
        password: { type: GraphQLString }
      },
      resolve: (_, { login, password }) => User.findOne({ login, password })
    },
    tweets: {
      type: new GraphQLList(TweetType),
      resolve: () => Tweet.find({})
    },
    tweet: {
      type: TweetType,
      args: {
        id: { type: GraphQLID },
        login: { type: GraphQLString },
        password: { type: GraphQLString },
        targetID: { type: GraphQLID }
      },
      async resolve(_, { id: _id, login, password, targetID }) {
        let user = await User.findOne({ _id, login, password }),
            tweet = await Tweet.findById(targetID);

        tweet.isLiked = tweet.likes.find(io => str(io) === str(user._id)) ? true:false;
        tweet.isSubscribedToCreator = user.subscribedTo.find(io => str(io) === tweet.creatorID) ? true:false;

        if(user && tweet) {
          return tweet;
        } else {
          return null;
        }
      }
    },
    comments: {
      type: new GraphQLList(CommentType),
      resolve: () => Comment.find({})
    },
    comment: {
      type: CommentType,
      args: {
        id: { type: GraphQLID }
      },
      resolve: (_, { id }) => Comment.findById(id)
    },
    fetchFeed: {
      type: new GraphQLList(TweetType),
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        cursorID: { type: GraphQLID },
        isReal: { type: GraphQLBoolean }
      },
      async resolve(_, { id: _id, login, password, materialLikes, cursorID, isReal }) {
        let user = await User.findOne({ _id, login, password });
        if(!user) return null;

        let a = null;
        {
          let b = {
            creatorID: {
              $in: [...user.subscribedTo, _id]
            }
          }

          if(cursorID) {
            b._id = {
              $lt: cursorID
            }
          }

          if(isReal) {
            a = await Tweet.find(b).sort({ time: -1 }).limit(infiniteScrollSplit);
          } else {
            a = await Tweet.find(b).sort({ time: -1 });
          }
        }

        return a;
      }
    },
    searchTweets: {
      type: new GraphQLList(TweetType),
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        request: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(_, { id: _id, login, password, request: req }) {
        let user = await User.findOne({ _id, login, password });

        if(user) {
          return Tweet.find({
            content: {
              $in: [(new RegExp(req, "i"))]
            },
            creatorID: {
              $ne: _id
            }
          }).sort({ time: -1 });
        } else {
          return null;
        }
      }
    },
    searchUsers: {
      type: new GraphQLList(UserType),
      args: {
        id: { type: GraphQLID },
        login: { type: GraphQLString },
        password: { type: GraphQLString },
        request: { type: GraphQLString }
      },
      async resolve(_, { id: _id, login, password, request: req }) {
        let user = await User.findOne({ _id, login, password });

        if(user) {
          return User.find({
            $or: [
              {
                name: {
                  $in: [(new RegExp(req, "i"))]
                }
              },
              {
                url: {
                  $in: [(new RegExp(req, "i"))]
                }
              },
              {
                location: {
                  $in: [(new RegExp(req, "i"))]
                }
              }
            ],
            _id: { // dont search yourself :)
              $ne: _id
            }
          });
        } else {
          return null;
        }
      }
    },
    conversations: {
      type: new GraphQLList(ConversationType),
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(_, { id: _id, login, password }) {
        let user = await User.findOne({ _id, login, password });

        if(user) {
          return Conversation.find({
            members: {
              $in: [_id]
            }
          });
        } else {
          return null;
        }
      }
    },
    conversation: {
      type: ConversationType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        conversationID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id: _id, login, password, conversationID }) {
        let user = await User.findOne({ _id, login, password });
        if(!user) return null;
        return Conversation.findOne({
          _id: conversationID,
          members: {
            $in: [_id]
          }
        });
      }
    }
  }
});

const RootMutation = new GraphQLObjectType({
  name: "RootMutation",
  fields: {
    registerUser: {
      type: UserType,
      args: {
        name: { type: new GraphQLNonNull(GraphQLString) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        image: { type: new GraphQLNonNull(GraphQLUpload) },
        url: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(_, { name, login, password, image, url }) {
        if(await User.findOne({ $or: [
          { url },
          { login }
        ] })) {
          return null;
        }

        const { stream, mimetype } = await image;
        const imagePath = `/files/avatars/${ gen() }.${ mimeprocessor.extension(mimetype) }`;
        stream.pipe(fs.createWriteStream('.' + imagePath));

        let a = await new User({
          name, login, password, url,
          image: imagePath,
          location: "",
          joinedDate: new Date(),
          subscribedTo: [],
          profileDescription: "",
          profileBackground: ""
        }).save();

        return a;
      }
    },
    updateUserInfo: {
      type: UserType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        name: { type: GraphQLString },
        description: { type: GraphQLString },
        location: { type: GraphQLString },
        image: { type: GraphQLUpload },
        background: { type: GraphQLUpload }
      },
      async resolve(_, { id: _id, login, password, name, description, location, image, background, resetImage, resetBackground }) {
        let user = await User.findOne({ _id, login, password });
        if(user) {
          let deleteImage = false,
              deleteBackground = false;

          // Receive image(avatar)
          let imagePath = "";
          {
            let data = await image;
            deleteImage = data === "DELETE_CURRENT_IMAGE_ACTION_NO_URL_PROVIDED";
            if(data && !resetImage && !deleteImage) {
              imagePath = `/files/avatars/${ gen() }.${ mimeprocessor.extension(data.mimetype) }`;
              data.stream.pipe(fs.createWriteStream('.' + imagePath));
            }
          }

          // Receive background
          let backgroundPath = "";
          {
            let data = await background;
            deleteBackground = data === "DELETE_CURRENT_IMAGE_ACTION_NO_URL_PROVIDED";
            if(data && !resetBackground && !deleteBackground) {
              backgroundPath = `/files/backgrounds/${ gen() }.${ mimeprocessor.extension(data.mimetype) }`;
              data.stream.pipe(fs.createWriteStream('.' + backgroundPath));
            }
          }

          // Update document(user)
          let a = {
            name: name,
            profileDescription: description,
            location: location,
            profileBackground: (backgroundPath && !deleteBackground) ? (backgroundPath) : (deleteBackground) ? "" : user.profileBackground,
            image: (imagePath && !deleteImage) ? (imagePath) : (deleteImage) ? "" : user.image
          }
          await user.updateOne(a);

          // Send response to page subscribers
          pubsub.publish("accountInfoUpdated", {
            user: {
              ...user._doc,
              ...a
            }
          });

          // Send response to client
          return a;
        } else {
          return null;
        }
      }
    },
    subscribeUser: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        targetID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id: _id, login, password, targetID }) {
        if(_id === targetID) return false;

        let mainUser = await User.findOne({ _id, login, password }),
            targetUser = await User.findById(targetID);
        if(mainUser && targetUser && mainUser._id !== targetUser._id) {
          let subscribed = await User.findOne({
            _id: mainUser._id,
            subscribedTo: {
              $in: [str(targetUser._id)]
            }
          });

          // if(!subscribed) { // subscribe
          //   await User.findOneAndUpdate({ _id: mainUser._id }, {
          //     $push: { subscribedTo: targetID }
          //   });
          //   return true;
          // } else { // unsubscribe
          //   await User.findOneAndUpdate({ _id: mainUser._id }, {
          //     $pull: { subscribedTo: targetID }
          //   });
          //   return false;
          // }

          if(!subscribed) {
            let notification = await (new Notification({
              contributorID: _id,
              eventType: "SUBSCRIBED_USER_EVENT",
              redirectID: _id,
              shortContent: "",
              influenced: [targetID],
              time: new Date()
            })).save();

            pubsub.publish("receivedNotification", {
              notification,
              target: targetID
            });
            pubsub.publish("navigationUpdated", {
              topic: "NOTIFICATIONS_TOPIC",
              sendedTo: targetID,
              sender: _id
            });

            await User.findByIdAndUpdate(targetID,
              {
                $push: {
                  notifications: notification._id
                }
              }
            );
          }

          await User.findOneAndUpdate({ _id: mainUser._id }, {
            [ (!subscribed) ? "$push" : "$pull" ]: { subscribedTo: targetID }
          });

          return (!subscribed) ? true:false;
        } else {
          return false;
        }
      }
    },
    addTweet: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        content: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(_, { id: _id, login, password, content }) {
        // Validate creator
        let user = await User.findOne({ _id, login, password });
        if(user) {
          // Create tweet
          let tweet = await new Tweet({
            content,
            creatorID: user.id,
            time: new Date()
          }).save();

          // Create and send data to subscribers as notification
          let notificationInfluenced = await User.find({
            subscribedTo: {
              $in: [_id]
            }
          });
          notificationInfluenced.forEach(({ id }, index, arr) => arr[index] = id);

          let notification = await (new Notification({
            contributorID: _id,
            eventType: "CREATED_TWEET_EVENT",
            redirectID: tweet._id,
            shortContent: shortCon(content),
            influenced: notificationInfluenced,
            time: new Date()
          })).save();

          await User.updateMany(
            {
              subscribedTo: {
                $in: [_id]
              }
            },
            {
              $push: {
                notifications: notification._id
              }
            }
          );

          // Send data to page subscribers
          pubsub.publish('addedTweet', {
            addedTweet: tweet
          });

          pubsub.publish("receivedNotification", {
            notification,
            target: _id
          });

          // Send data to creator's client
          return tweet;
        } else {
          // Reject generation
          return null;
        }
      }
    },
    deleteTweet: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        targetID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id: _id, login, password, targetID }) {
        let user = await User.findOne({ _id, login, password });
        let tweet = await Tweet.findById(targetID);

        if(str(user._id) !== str(tweet.creatorID)) return null; // OWNER_VALIDATION

        if(user && tweet) {
          await Comment.remove({
            sendedToID: {
              $in: [targetID]
            }
          });

          tweet = await tweet.remove();

          pubsub.publish("deletedTweet", {
            deletedTweet: tweet
          });

          return tweet;
        } else {
          return null;
        }
      }
    },
    commentTweet: {
      type: CommentType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        targetID: { type: new GraphQLNonNull(GraphQLID) },
        content: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(_, { id: _id, login, password, targetID, content }) {
        let user = await User.findOne({ _id, login, password }),
            tweet = await Tweet.findById(targetID);

        if(user && tweet) {
          let model = await (new Comment({
            content,
            sendedToID: tweet.id,
            creatorID: user.id,
            time: new Date()
          }).save());

          let notification = await (new Notification({
            contributorID: _id,
            eventType: "COMMENTED_TWEET_EVENT",
            redirectID: tweet._id,
            shortContent: shortCon(content),
            influenced: [tweet.creatorID],
            time: new Date()
          })).save();

          pubsub.publish("receivedNotification", {
            notification,
            target: tweet.creatorID
          });
          pubsub.publish("navigationUpdated", {
            topic: "NOTIFICATIONS_TOPIC",
            sendedTo: tweet.creatorID,
            sender: _id
          });

          await User.findByIdAndUpdate(tweet.creatorID,
            {
              $push: {
                notifications: notification._id
              }
            }
          );

          tweet.commentsInt = (await Comment.find({
            sendedToID: tweet.id
          })).length;

          pubsub.publish("commentedTweet", {
            tweet: {
              id: tweet.id,
              commentsInt: tweet.commentsInt,
              creatorID: tweet.creatorID
            }
          });
          pubsub.publish("addedComment", {
            comment: model
          });

          return model;
        } else {
          return null;
        }
      }
    },
    likeTweet: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        targetID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id: _id, login, password, targetID }) {
        let user = await User.findOne({ _id, login, password }),
            tweet = await Tweet.findById(targetID);

        if(true) { // user && tweet
          let isLiked = tweet.likes.find(io => str(io) === str(user._id)) ? true:false

          // if(!isLiked) {
          //   await tweet.update({
          //     $push: { likes: user._id }
          //   });

          //   pubsub.publish("likedTweet", {
          //     tweet: {
          //       id: tweet.id,
          //       likesInt: tweet.likes.length + 1
          //     },
          //     likerID: _id
          //   });

          //   return true;
          // } else {
          //   await tweet.update({
          //     $pull: { likes: user._id }
          //   });


          //   pubsub.publish("likedTweet", {
          //     tweet: {
          //       id: tweet.id,
          //       likesInt: tweet.likes.length - 1
          //     },
          //     likerID: _id
          //   });

          //   return false;
          // }

          if(!isLiked) {
            let notification = await (new Notification({
              contributorID: _id,
              eventType: "LIKED_TWEET_EVENT",
              redirectID: tweet._id,
              shortContent: shortCon(tweet.content),
              influenced: [tweet.creatorID],
              time: new Date()
            })).save();

            pubsub.publish("receivedNotification", {
              notification,
              target: tweet.creatorID
            });
            pubsub.publish("navigationUpdated", {
              topic: "NOTIFICATIONS_TOPIC",
              sendedTo: tweet.creatorID,
              sender: _id
            });

            await User.findByIdAndUpdate(tweet.creatorID,
              {
                $push: {
                  notifications: notification._id
                }
              }
            );
          }

          await tweet.updateOne({
            [ !isLiked ? "$push" : "$pull" ]: { likes: user._id }
          });

          pubsub.publish("likedTweet", {
            tweet: {
              id: tweet.id,
              likesInt: tweet.likes.length + (!isLiked ? 1 : -1),
              creatorID: tweet.creatorID
            },
            likerID: _id
          });

          return !isLiked;
        } else {
          return false;
        }
      }
    },
    deleteComment: {
      type: CommentType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        targetID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id: _id, login, password, targetID }) {
        let user = await User.findOne({ _id, login, password }),
            comment = await Comment.findById(targetID);

        if(str(user._id) !== str(comment.creatorID)) return null; // OWNER_VALIDATION

        if(user) {
          let tweet = await Tweet.findById(comment.sendedToID);

          tweet.commentsInt = (await Comment.find({
            sendedToID: comment.sendedToID
          })).length - 1;

          pubsub.publish("commentedTweet", {
            tweet
          });
          pubsub.publish("deletedComment", {
            comment: {
              id: comment.id,
              sendedToID: comment.sendedToID
            }
          });

          return comment.remove();
        } else {
          return null;
        }
      }
    },
    likeComment: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        targetID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id: _id, login, password, targetID }) {
        let user = await User.findOne({ _id, login, password }),
            comment = await Comment.findById(targetID);

        if(user && comment) {
          let isLiked = comment.likes.find(io => str(io) === str(user._id)) ? true:false;

          // if(!isLiked) {
          //   await Comment.findOneAndUpdate({ _id: comment.id }, {
          //     $push: { likes: user._id }
          //   });
          //   return true;
          // } else {
          //   await Comment.findOneAndUpdate({ _id: comment.id }, {
          //     $pull: { likes: user._id }
          //   });
          //   return false;
          // }

          await Comment.findOneAndUpdate({ _id: comment.id }, {
            [!isLiked ? "$push" : "$pull"]: { likes: user._id }
          });

          if(!isLiked) {
            let notification = await (new Notification({
              contributorID: _id,
              eventType: "LIKED_COMMENT_EVENT",
              redirectID: comment.sendedToID,
              shortContent: shortCon(comment.content),
              influenced: [comment.creatorID],
              time: new Date()
            })).save();

            pubsub.publish("receivedNotification", {
              notification,
              target: comment.creatorID
            });
            pubsub.publish("navigationUpdated", {
              topic: "NOTIFICATIONS_TOPIC",
              sendedTo: comment.creatorID,
              sender: _id
            });

            await User.findByIdAndUpdate(comment.creatorID,
              {
                $push: {
                  notifications: notification._id
                }
              }
            );
          }

          pubsub.publish("likedComment", {
            comment: {
              id: comment.id,
              sendedToID: comment.sendedToID,
              likesInt: (!isLiked) ? comment.likesInt + 1 : comment.likesInt
            }
          });

          return !isLiked;
        }
      }
    },
    destroyNotifications: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(_, { id: _id, login, password }) {
        // let user = await User.findOne({ _id, login, password });

        // if(user) {
        //   await user.updateOne({
        //     notifications: []
        //   })

        //   return true;
        // } else {
        //   return false;
        // }

        // let user = await User.findOne({ _id, login, password });

        let a = (await User.findOneAndUpdate(
          {
            _id, login, password
          },
          {
            notifications: []
          }
        )) ? true:false;

        { // https://github.com/olchyk98/twitter-clone/issues/3
          let b = await Notification.find({
            influenced: {
              $in: [_id]
            }
          });

          if(b.length) {
            let c = [], // delete notification
                d = []; // delete user from notification
            b.forEach(io => { // every notification
              if(io.influenced.length - 1 <= 0) { // detach notification
                c.push(io.id);
              } else { // detach user from influenced array
                d.push(io.id);
              }
            });

            if(c.length) {
              await Notification.remove({
                _id: {
                  $in: c
                }
              });
            }
            if(d.length) {
              await Notification.updateMany(
                {
                  _id: {
                    $in: d
                  }
                },
                {
                  $pull: {
                    influenced: _id
                  }
                }
              );
            }
          }
        }

        return a;
      }
    },
    createConversation: {
      type: ConversationType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        victimID: { type: new GraphQLNonNull(GraphQLID) },
        victimURL: { type: new GraphQLNonNull(GraphQLString) }
      },
      async resolve(_, { id: _id, login, password, victimID, victimURL }) {
        if(_id === victimID || (!victimID && !victimURL)) return null;

        if(!victimID && victimURL) {
          victimID = await User.findOne({
            url: victimURL
          });

          // Victim validation
          if(!victimID || _id === victimID.id) return null;
          else victimID = victimID.id;
        }

        // If conversation with those members exists -> return exists conversation
        let conversation = await Conversation.findOne({
          members: {
            $all: [_id, victimID]
          }
        });

        if(!conversation) { // validate user and create a new conversation
          let user = await User.findOne({ _id, login, password });
          if(user && victimID) { // create a new conversation
            let nConversation = await (new Conversation({
              members: [_id, victimID],
              messages: [],
              lastContent: "",
              lastContentType: "",
              lastTime: new Date(),
              isWriting: []
            })).save();

            pubsub.publish("conversationCreatedNew", {
              conversation: nConversation,
              creator: _id
            });

            return nConversation;
          } else { // invalid user data -> null
            return null;
          }
        } else { // return exists conversation
          return conversation;
        }
      }
    },
    sendMessage: {
      type: MessageType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        conversationID: { type: new GraphQLNonNull(GraphQLID) },
        content: { type: GraphQLString },
        contentType: { type: GraphQLString }
      },
      async resolve(_, { id: _id, login, password, conversationID, content, contentType }) {
        // Validate user in conversation
        let conversation = await Conversation.findOne({
          _id: conversationID,
          members: {
            $in: [_id]
          }
        });

        if(conversation) { // validated
          let message = {
            id: conversation.messages.length,
            creator: _id,
            content, contentType,
            time: new Date(),
            isRequesterViewed: false
          }

          let upConversation = {
            lastTime: new Date(),
            lastContent: (contentType !== "STICKER_TYPE") ? shortCon(content) : content,
            lastContentType: contentType
          }

          pubsub.publish("conversationsContentUpdated", { // conversation preview
            conversation: {
              id: str(conversation._id),
              members: conversation.members,
              ...upConversation
            }
          });
          pubsub.publish("conversationSendedMessage", {
            sendedTo: conversation._id,
            members: conversation.members,
            creator: _id,
            message
          });
          pubsub.publish("navigationUpdated", {
            topic: "MESSAGES_TOPIC",
            sendedTo: conversation.members.find(io => io !== _id),
            sender: _id
          });

          await conversation.updateOne({
            $push: {
              messages: message
            },
            ...upConversation
          });

          return message;
        } else {
          return null;
        }
      }
    },
    viewMessages: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        conversationID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id, login, password, conversationID }) {
        let user = await User.findOne({ _id: id, login, password });
        if(!user) return false;

        let conversation = await Conversation.findOne({
          _id: conversationID,
          members: {
            $in: [id]
          }
        });

        let nextMember = conversation.members.find(io => str(io) !== str(id));

        if(conversation) {
          let messages = [];
          conversation.messages.forEach(io => {
            if(str(io.creator) === str(nextMember)) io.isRequesterViewed = true;
            messages.push(io);
          });

          pubsub.publish("viewedMessages", {
            conversation,
            viewer: id
          });
          pubsub.publish("conversationTypingStatus", {
            target: conversationID,
            typer: id,
            typing: false
          });

          await conversation.updateOne({
            messages,
            $pull: {
              isWriting: id
            }
          });

          return true;
        } else {
          return false;
        }
      }
    },
    startMessage: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        conversationID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id: _id, login, password, conversationID }) {
        let user = await User.find({ _id, login, password });
        if(user) {
          let conversation = await Conversation.findOne({
            _id: conversationID,
            members: {
              $in: [_id]
            }
          });

          if(!conversation) return false;

          if(!conversation.isWriting.find(io => str(io) === _id)) { // start
            pubsub.publish("conversationTypingStatus", {
              target: conversationID,
              typer: _id,
              typing: true
            });

            await conversation.updateOne({
              $push: {
                isWriting: _id
              }
            });
          }

          return true;
        } else {
          return false;
        }
      }
    },
    stopMessage: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        conversationID: { type: new GraphQLNonNull(GraphQLID) }
      },
      async resolve(_, { id: _id, login, password, conversationID }) {
        let user = await User.find({ _id, login, password });
        if(user) {
          let conversation = await Conversation.findOne({
            _id: conversationID,
            members: {
              $in: [_id]
            }
          });

          if(!conversation) return false;

          if(conversation.isWriting.find(io => str(io) === _id)) { // stop
            pubsub.publish("conversationTypingStatus", {
              target: conversationID,
              typer: _id,
              typing: false
            });

            await conversation.updateOne({
              $pull: {
                isWriting: _id
              }
            });
          }

          return true;
        } else {
          return false;
        }
      }
    }
  }
});

const RootSubscription = new GraphQLObjectType({
  name: "subscription",
  fields: {
    addedFeedTweet: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ addedTweet }) => addedTweet,
      subscribe: withFilter(
        () => pubsub.asyncIterator('addedTweet'),
        async ({ addedTweet: tweet }, { id: _id }) => {
          if(tweet.creatorID === _id) return false;

          let a = await User.findOne({
            _id,
            subscribedTo: {
             $in: [tweet.creatorID]
            }
          });

          return (a ? true:false);
        }
      )
    },
    deletedFeedTweet: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ deletedTweet }) => deletedTweet,
      subscribe: withFilter(
        () => pubsub.asyncIterator("deletedTweet"),
        async ({ deletedTweet: tweet }, { id: _id }) => {
          if(tweet.creatorID === _id) return false;

          let a = await User.findOne({
            _id,
            subscribedTo: {
             $in: [tweet.creatorID]
            }
          });

          return (a ? true:false);
        }
      )
    },
    updatedFeedTweetLikes: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ tweet }) => tweet,
      subscribe: withFilter(
        () => pubsub.asyncIterator('likedTweet'),
        async ({ tweet, likerID }, { id: _id }) => {
          if(_id === likerID) return false;

          let a = false;
          if(tweet.creatorID === _id) { // creator
            a = true;
          } else { // check by subscription
            a = await User.findOne({
              _id,
              subscribedTo: {
               $in: [tweet.creatorID]
              }
            });
          }

          return (a ? true:false);
        }
      )
    },
    updatedFeedTweetComments: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ tweet }) => tweet,
      subscribe: withFilter(
        () => pubsub.asyncIterator('commentedTweet'),
        async ({ tweet }, { id: _id }) => {
          let a = false;

          if(tweet.creatorID === _id) {
            a = true;
          } else {
            a = await User.findOne({
              _id,
              subscribedTo: {
               $in: [tweet.creatorID]
              }
            });
          }

          return (a ? true:false);
        }
      )
    },
    updatedTweetLikes: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ tweet }) => tweet,
      subscribe: withFilter(
        () => pubsub.asyncIterator('likedTweet'),
        ({ tweet: { id } }, { id: _id }) => id === _id
      )
    },
    addedTweetComment: {
      type: CommentType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        tweetID: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ comment }) => comment,
      subscribe: withFilter(
        () => pubsub.asyncIterator('addedComment'),
        ({ comment: { creatorID, sendedToID } }, { id, tweetID }) => (sendedToID === tweetID && creatorID !== id)
      )
    },
    deletedTweetComment: {
      type: CommentType,
      args: {
        tweetID: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ comment }) => comment,
      subscribe: withFilter(
        () => pubsub.asyncIterator('deletedComment'),
        ({ comment: { sendedToID } }, { tweetID }) => sendedToID === tweetID
      )
    },
    likedTweetComment: {
      type: CommentType,
      args: {
        tweetID: { type: GraphQLID }
      },
      resolve: ({ comment }) => comment,
      subscribe: withFilter(
        () => pubsub.asyncIterator('likedComment'),
        ({ comment: { sendedToID } }, { tweetID }) => sendedToID === tweetID
      )
    },
    updatedAccountTweetLikes: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        url: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: ({ tweet }) => tweet,
      subscribe: withFilter(
        () => pubsub.asyncIterator('likedTweet'),
        async ({ tweet: { creatorID: _id } }, { id, url }) => {
          if(url) {
            return (await User.findOne({ _id })).url === url;
          } else if(id) {
            return _id === id;
          } else {
            return false;
          }
        }
      )
    },
    updatedAccountTweetComments: {
      type: TweetType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        url: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: ({ tweet }) => tweet,
      subscribe: withFilter(
        () => pubsub.asyncIterator('commentedTweet'),
        async ({ tweet: { creatorID: _id } }, { id, url }) => {
          if(url) {
            return (await User.findOne({ _id })).url === url;
          } else if(id) {
            return _id === id;
          } else {
            return false;
          }
        }
      )
    },
    updatedAccountInformation: {
      type: UserType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        url: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: ({ user }) => user,
      subscribe: withFilter(
        () => pubsub.asyncIterator('accountInfoUpdated'),
        ({ user }, { id, url }) => {
          return (
            user.id !== id &&
            user.url && url && user.url === url
          );
        }
      )
    },
    receivedNotification: {
      type: NotificationType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ notification }) => notification,
      subscribe: withFilter(
        () => pubsub.asyncIterator('receivedNotification'),
        async ({ notification: { eventType }, target: owner }, { id: _id }) => {
          let a = false;
          switch(eventType) {
            case 'CREATED_TWEET_EVENT':
              a = (await User.findOne({
                  _id,
                  subscribedTo: {
                    $in: [owner]
                  }
              })) ? true:false;
            break;
            case 'SUBSCRIBED_USER_EVENT':
            case 'LIKED_TWEET_EVENT':
            case 'COMMENTED_TWEET_EVENT':
            case 'LIKED_COMMENT_EVENT':
              a = str(owner) === str(_id);
            break;
            default:break;
          }
          return a;
        }
      )
    },
    conversationsContentUpdated: {
      type: ConversationType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: ({ conversation }) => conversation,
      subscribe: withFilter(
        () => pubsub.asyncIterator('conversationsContentUpdated'),
        async ({ conversation }, { id: _id, login, password, conversationID }) => {
          if(conversation.members.indexOf(_id) === -1) return false;
          let user = await User.findOne({ _id, login, password });

          return user ? true:false;
        }
      )
    },
    conversationGotMessage: {
      type: MessageType, // sendedTO, members
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        conversationID: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ message }) => message,
      subscribe: withFilter(
        () => pubsub.asyncIterator('conversationSendedMessage'),
        async ({ message, sendedTo, members, convID, creator }, { id: _id, login, password, conversationID }) => {
          if(str(creator) === str(_id) || members.indexOf(str(_id)) === -1) return false;
          if(str(sendedTo) !== str(conversationID)) return false;

          let user = await User.findOne({ _id, login, password });
          return (user) ? true:false;
        }
      )
    },
    conversationSeenMessages: {
      type: ConversationType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        conversationID: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ conversation }) => conversation,
      subscribe: withFilter(
        () => pubsub.asyncIterator("viewedMessages"),
        async ({ conversation, viewer }, { id: _id, login, password, conversationID }) => {
          {
            let a = conversation.members;
            if(conversationID !== conversation.id || str(viewer) === str(_id) || (a.indexOf(str(_id)) === -1 || a.indexOf(str(viewer)) === -1)) return false; // XXX
          }
          let user = await User.findOne({ _id, login, password });

          return (user) ? true:false; 
        }
      )
    },
    conversationNewTypingStatus: {
      type: GraphQLBoolean,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) },
        conversationID: { type: new GraphQLNonNull(GraphQLID) }
      },
      resolve: ({ typing }) => typing,
      subscribe: withFilter(
        () => pubsub.asyncIterator('conversationTypingStatus'),
        async ({ target, typer }, { id: _id, login, password, conversationID }) => {
          if(str(typer) === str(_id) || str(target) !== str(conversationID)) return false;

          let user = await User.find({ _id, login, password });
          return (user) ? true:false;
        }
      )
    },
    conversationGotNew: {
      type: ConversationType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: ({ conversation }) => conversation,
      subscribe: withFilter(
        () => pubsub.asyncIterator("conversationCreatedNew"),
        async ({ conversation, creator }, { id: _id, login, password }) => {
          if(creator === _id) return false;

          // Validate user
          let user = await User.findOne({ _id, login, password });
          if(!user) return false;

          // Validate if user's id exists in conversation's members array
          if(conversation.members.indexOf(user._id) === -1) return false;

          // Return result
          return true;
        }
      )
    },
    navigationGotEvent: {
      type: GraphQLString,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
        login: { type: new GraphQLNonNull(GraphQLString) },
        password: { type: new GraphQLNonNull(GraphQLString) }
      },
      resolve: ({ topic }) => topic,
      subscribe: withFilter(
        () => pubsub.asyncIterator('navigationUpdated'),
        async ({ topic, sendedTo, sender }, { id: _id, login, password }) => {
          if(str(sendedTo) !== str(_id) || sender === _id) return false;
          // Validate user
          let user = await User.findOne({ _id, login, password });
          return (user) ? true:false;
        }
      )
    }
  }
})

module.exports = new GraphQLSchema({
  query: RootQuery,
  mutation: RootMutation,
  subscription: RootSubscription
});